import { prisma } from "../db/client";
import { NotificationType } from "../types";
import { redis } from "../utils/redis";
import { emailService } from "./email.service";
import axios from "axios";

export interface NotificationData {
  title: string;
  body: string;
  type: NotificationType;
  data?: Record<string, any>;
  userId?: string;
  userIds?: string[];
  actionUrl?: string;
  imageUrl?: string;
}

export class NotificationService {
  private expoApiUrl = "https://exp.host/--/api/v2/push/send";

  /**
   * Send notification to single user
   */
  async sendNotification(userId: string, notification: NotificationData): Promise<void> {
    // Store in database
    await prisma.notification.create({
      data: {
        userId,
        title: notification.title,
        body: notification.body,
        type: notification.type,
        data: notification.data || {},
      },
    });

    // Get user notification settings
    const settings = await this.getUserNotificationSettings(userId);

    // Send push notification
    if (settings.pushNotifications && (await this.shouldSendPush(userId, notification.type))) {
      await this.sendPushNotification(userId, notification);
    }

    // Send email notification for important types
    if (settings.emailNotifications && this.shouldSendEmail(notification.type)) {
      await this.sendEmailNotification(userId, notification);
    }

    // Clear cache
    await redis.del(`notifications:${userId}`);
  }

  /**
   * Send notification to multiple users
   */
  async sendBulkNotifications(userIds: string[], notification: NotificationData): Promise<void> {
    const chunks = this.chunkArray(userIds, 100); // Process in chunks

    for (const chunk of chunks) {
      await Promise.all(chunk.map((userId) => this.sendNotification(userId, notification)));
    }
  }

  /**
   * Send push notification via Expo
   */
  async sendPushNotification(userId: string, notification: NotificationData): Promise<void> {
    const pushTokens = await prisma.pushToken.findMany({
      where: { userId, isActive: true },
    });

    if (pushTokens.length === 0) return;

    const unreadCount = await this.getUnreadCount(userId);
    const messages = pushTokens.map((token) => ({
      to: token.token,
      sound: "default",
      title: notification.title,
      body: notification.body,
      data: {
        ...notification.data,
        type: notification.type,
        actionUrl: notification.actionUrl,
      },
      badge: unreadCount,
    }));

    try {
      const response = await axios.post(this.expoApiUrl, messages, {
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
      });

      // Handle response and update invalid tokens
      if (response.data?.data) {
        await this.handlePushResponse(response.data.data, pushTokens);
      }
    } catch (error) {
      console.error("Push notification error:", error);
    }
  }

  /**
   * Send email notification for important events
   */
  async sendEmailNotification(userId: string, notification: NotificationData): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true, username: true },
    });

    if (!user) return;

    const emailData = {
      email: user.email,
      name: user.displayName || user.username,
      subject: notification.title,
      content: notification.body,
      actionUrl: notification.actionUrl,
      type: notification.type,
    };

    switch (notification.type) {
      case NotificationType.BOOK_CLUB_INVITE:
        await emailService.sendBookClubInviteEmail(emailData);
        break;
      case NotificationType.GOAL_ACHIEVED:
        await emailService.sendGoalAchievedEmail(emailData);
        break;
      case NotificationType.WEEKLY_DIGEST:
        await emailService.sendWeeklyDigestEmail(emailData);
        break;
      default:
        await emailService.sendGeneralNotificationEmail(emailData);
    }
  }

  /**
   * Get user notifications with pagination
   */
  async getUserNotifications(
    userId: string,
    options: { page?: number; limit?: number; unreadOnly?: boolean } = {},
  ): Promise<{
    notifications: any[];
    total: number;
    unreadCount: number;
    page: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 20, unreadOnly = false } = options;

    const where = {
      userId,
      ...(unreadOnly && { isRead: false }),
    };

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return {
      notifications,
      total,
      unreadCount,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Mark notifications as read
   */
  async markAsRead(notificationIds: string[], userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: {
        id: { in: notificationIds },
        userId, // Ensure user can only mark their own notifications
      },
      data: { isRead: true },
    });

    // Clear cache
    await redis.del(`notifications:${userId}`);
  }

  /**
   * Register push token
   */
  async registerPushToken(userId: string, token: string, platform: string): Promise<void> {
    await prisma.pushToken.upsert({
      where: { token },
      create: {
        userId,
        token,
        platform,
        isActive: true,
      },
      update: {
        userId,
        platform,
        isActive: true,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Remove push token
   */
  async removePushToken(token: string): Promise<void> {
    await prisma.pushToken.updateMany({
      where: { token },
      data: { isActive: false },
    });
  }

  /**
   * Get/Create user notification settings
   */
  async getUserNotificationSettings(userId: string) {
    let settings = await prisma.notificationSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      settings = await prisma.notificationSettings.create({
        data: { userId },
      });
    }

    return settings;
  }

  /**
   * Update notification settings
   */
  async updateNotificationSettings(userId: string, updates: any) {
    return prisma.notificationSettings.upsert({
      where: { userId },
      create: { userId, ...updates },
      update: updates,
    });
  }

  /**
   * Schedule reading reminders
   */
  async scheduleReadingReminders(): Promise<void> {
    // Find users who haven't updated their reading in 3 days
    const inactiveUsers = await prisma.$queryRaw<any[]>`
      SELECT DISTINCT u.id, u.email, u.display_name
      FROM users u
      JOIN notification_settings ns ON u.id = ns.user_id
      WHERE ns.reading_reminders = true
        AND u.id NOT IN (
          SELECT ub.user_id 
          FROM user_books ub 
          WHERE ub.updated_at > NOW() - INTERVAL '3 days'
        )
        AND u.created_at < NOW() - INTERVAL '7 days'
        AND u.is_email_verified = true
    `;

    for (const user of inactiveUsers) {
      await this.sendNotification(user.id, {
        title: "📚 Missing your books?",
        body: "Don't let your reading streak break! Check out your library.",
        type: NotificationType.READING_REMINDER,
        actionUrl: "/library",
      });
    }
  }

  /**
   * Send goal progress notifications
   */
  async checkGoalProgress(): Promise<void> {
    const currentYear = new Date().getFullYear();

    // Find users close to their goals
    const usersNearGoal = await prisma.$queryRaw<any[]>`
      SELECT 
        rg.user_id,
        rg.target_books,
        rg.current_books,
        u.display_name
      FROM reading_goals rg
      JOIN users u ON rg.user_id = u.id
      JOIN notification_settings ns ON u.id = ns.user_id
      WHERE rg.year = ${currentYear}
        AND ns.goal_reminders = true
        AND rg.current_books >= rg.target_books * 0.8
        AND rg.current_books < rg.target_books
    `;

    for (const user of usersNearGoal) {
      const remaining = user.target_books - user.current_books;
      await this.sendNotification(user.user_id, {
        title: "🎯 Almost there!",
        body: `You're only ${remaining} book${remaining > 1 ? "s" : ""} away from your goal!`,
        type: NotificationType.GOAL_PROGRESS,
        actionUrl: "/goals",
      });
    }
  }

  /**
   * Send weekly digest
   */
  async sendWeeklyDigest(): Promise<void> {
    const usersWithDigest = await prisma.user.findMany({
      where: {
        notificationSettings: {
          weeklyDigest: true,
        },
        isEmailVerified: true,
      },
      include: {
        notificationSettings: true,
      },
    });

    for (const user of usersWithDigest) {
      const digestData = await this.generateWeeklyDigest(user.id);

      if (digestData.hasActivity) {
        await this.sendNotification(user.id, {
          title: "📊 Your weekly reading recap",
          body: `${digestData.booksRead} books read, ${digestData.pagesRead} pages completed!`,
          type: NotificationType.WEEKLY_DIGEST,
          data: digestData,
          actionUrl: "/analytics",
        });
      }
    }
  }

  /**
   * Book club notifications
   */
  async notifyBookClubMembers(
    clubId: string,
    notification: NotificationData,
    excludeUserId?: string,
  ): Promise<void> {
    const members = await prisma.bookClubMember.findMany({
      where: {
        clubId,
        status: "ACTIVE",
        userId: excludeUserId ? { not: excludeUserId } : undefined,
      },
      include: {
        user: {
          include: {
            notificationSettings: true,
          },
        },
      },
    });

    const userIds = members
      .filter((member) => member.user.notificationSettings?.bookClubNotifications !== false)
      .map((member) => member.userId);

    if (userIds.length > 0) {
      await this.sendBulkNotifications(userIds, notification);
    }
  }

  // Private helper methods
  private async getUnreadCount(userId: string): Promise<number> {
    const cached = await redis.get(`unread_count:${userId}`);
    if (cached) return parseInt(cached);

    const count = await prisma.notification.count({
      where: { userId, isRead: false },
    });

    await redis.setex(`unread_count:${userId}`, 300, count.toString());
    return count;
  }

  private shouldSendEmail(type: NotificationType): boolean {
    const emailTypes = [
      NotificationType.BOOK_CLUB_INVITE,
      NotificationType.GOAL_ACHIEVED,
      NotificationType.WEEKLY_DIGEST,
    ];
    return emailTypes.includes(type);
  }

  private async shouldSendPush(userId: string, type: NotificationType): Promise<boolean> {
    // Rate limiting: don't send too many notifications of the same type
    const key = `push_limit:${userId}:${type}`;
    const count = await redis.get(key);

    if (count && parseInt(count) > 5) return false;

    await redis.incr(key);
    await redis.expire(key, 3600); // 1 hour

    return true;
  }

  private async handlePushResponse(responseData: any[], tokens: any[]): Promise<void> {
    const invalidTokens: string[] = [];

    responseData.forEach((response, index) => {
      if (response.status === "error") {
        if (response.details?.error === "DeviceNotRegistered") {
          invalidTokens.push(tokens[index].token);
        }
      }
    });

    if (invalidTokens.length > 0) {
      await prisma.pushToken.updateMany({
        where: { token: { in: invalidTokens } },
        data: { isActive: false },
      });
    }
  }

  private async generateWeeklyDigest(userId: string) {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [booksRead, pagesRead, readingSessions] = await Promise.all([
      prisma.userBook.count({
        where: {
          userId,
          listType: "READ",
          dateFinished: { gte: weekAgo },
        },
      }),
      prisma.userBook.aggregate({
        where: {
          userId,
          listType: "READ",
          dateFinished: { gte: weekAgo },
        },
        _sum: { currentPage: true },
      }),
      prisma.readingSession.count({
        where: {
          userId,
          startTime: { gte: weekAgo },
        },
      }),
    ]);

    return {
      booksRead,
      pagesRead: pagesRead._sum.currentPage || 0,
      readingSessions,
      hasActivity: booksRead > 0 || readingSessions > 0,
    };
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

export const notificationService = new NotificationService();
