import { prisma } from "../db/client";
import { BookClubRole, DiscussionType, MembershipStatus } from "../types";
import { AppError } from "../utils/app-error";
import { notificationService } from "./notification.service";
import * as crypto from "crypto";

export class BookClubService {
  /**
   * Create a new book club
   */
  async createBookClub(
    userId: string,
    data: {
      name: string;
      description?: string;
      isPrivate?: boolean;
      memberLimit?: number;
      rules?: string;
    },
  ) {
    const inviteCode = data.isPrivate ? this.generateInviteCode() : null;

    const bookClub = await prisma.bookClub.create({
      data: {
        ...data,
        creatorId: userId,
        inviteCode,
      },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: { members: true },
        },
      },
    });

    // Add creator as admin member
    await prisma.bookClubMember.create({
      data: {
        clubId: bookClub.id,
        userId,
        role: BookClubRole.ADMIN,
        status: MembershipStatus.ACTIVE,
      },
    });

    return bookClub;
  }

  /**
   * Join a book club
   */
  async joinBookClub(userId: string, clubId: string, inviteCode?: string) {
    const club = await prisma.bookClub.findUnique({
      where: { id: clubId },
      include: { _count: { select: { members: true } } },
    });

    if (!club || !club.isActive) {
      throw new AppError("Book club not found", 404, "CLUB_NOT_FOUND");
    }

    // Check if private club and validate invite code
    if (club.isPrivate && club.inviteCode !== inviteCode) {
      throw new AppError("Invalid invite code", 400, "INVALID_INVITE_CODE");
    }

    // Check member limit
    if (club.memberLimit && club._count.members >= club.memberLimit) {
      throw new AppError("Book club is full", 400, "CLUB_FULL");
    }

    // Check if already a member
    const existingMember = await prisma.bookClubMember.findUnique({
      where: {
        clubId_userId: { clubId, userId },
      },
    });

    if (existingMember) {
      if (existingMember.status === MembershipStatus.ACTIVE) {
        throw new AppError("Already a member", 400, "ALREADY_MEMBER");
      }
      // Reactivate if inactive
      return prisma.bookClubMember.update({
        where: { id: existingMember.id },
        data: { status: MembershipStatus.ACTIVE },
      });
    }

    const member = await prisma.bookClubMember.create({
      data: {
        clubId,
        userId,
        role: BookClubRole.MEMBER,
        status: MembershipStatus.ACTIVE,
      },
    });

    // Notify club members
    await notificationService.notifyBookClubMembers(
      clubId,
      {
        title: "New member joined!",
        body: `Someone new joined ${club.name}`,
        type: "BOOK_CLUB_INVITE",
        actionUrl: `/book-clubs/${clubId}`,
      },
      userId,
    );

    return member;
  }

  /**
   * Leave book club
   */
  async leaveBookClub(userId: string, clubId: string) {
    const member = await prisma.bookClubMember.findUnique({
      where: {
        clubId_userId: { clubId, userId },
      },
    });

    if (!member) {
      throw new AppError("Not a member", 400, "NOT_MEMBER");
    }

    // Can't leave if you're the only admin
    if (member.role === BookClubRole.ADMIN) {
      const adminCount = await prisma.bookClubMember.count({
        where: {
          clubId,
          role: BookClubRole.ADMIN,
          status: MembershipStatus.ACTIVE,
        },
      });

      if (adminCount === 1) {
        throw new AppError("Cannot leave as the only admin", 400, "ONLY_ADMIN");
      }
    }

    await prisma.bookClubMember.update({
      where: { id: member.id },
      data: { status: MembershipStatus.INACTIVE },
    });
  }

  /**
   * Get book club details
   */
  async getBookClubDetails(clubId: string, userId?: string) {
    const club = await prisma.bookClub.findUnique({
      where: { id: clubId },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        members: {
          where: { status: MembershipStatus.ACTIVE },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
        },
        readings: {
          where: { isActive: true },
          include: {
            book: true,
            _count: {
              select: { progress: true },
            },
          },
          orderBy: { startDate: "desc" },
          take: 1,
        },
        _count: {
          select: {
            members: { where: { status: MembershipStatus.ACTIVE } },
            discussions: true,
          },
        },
      },
    });

    if (!club) {
      throw new AppError("Book club not found", 404, "CLUB_NOT_FOUND");
    }

    const userMember = userId ? club.members.find((m) => m.userId === userId) : null;

    return {
      ...club,
      userRole: userMember?.role || null,
      isMember: !!userMember,
      currentReading: club.readings[0] || null,
    };
  }

  /**
   * Start new reading
   */
  async startReading(
    userId: string,
    clubId: string,
    data: {
      bookId: string;
      startDate: Date;
      endDate: Date;
      description?: string;
    },
  ) {
    // Check if user is admin/moderator
    await this.verifyPermissions(userId, clubId, [BookClubRole.ADMIN, BookClubRole.MODERATOR]);

    // End current active reading
    await prisma.bookClubReading.updateMany({
      where: { clubId, isActive: true },
      data: { isActive: false },
    });

    const reading = await prisma.bookClubReading.create({
      data: {
        clubId,
        bookId: data.bookId,
        startDate: data.startDate,
        endDate: data.endDate,
        description: data.description,
        isActive: true,
      },
      include: {
        book: true,
        club: true,
      },
    });

    // Notify members
    await notificationService.notifyBookClubMembers(
      clubId,
      {
        title: "New book selected!",
        body: `${reading.club.name} is now reading "${reading.book.title}"`,
        type: "BOOK_CLUB_NEW_READING",
        actionUrl: `/book-clubs/${clubId}/readings/${reading.id}`,
      },
      userId,
    );

    return reading;
  }

  /**
   * Update reading progress
   */
  async updateReadingProgress(
    userId: string,
    readingId: string,
    data: {
      currentPage?: number;
      progress?: number;
      isFinished?: boolean;
      notes?: string;
    },
  ) {
    const reading = await prisma.bookClubReading.findUnique({
      where: { id: readingId },
      include: { book: true },
    });

    if (!reading) {
      throw new AppError("Reading not found", 404, "READING_NOT_FOUND");
    }

    // Calculate progress if page provided
    let progress = data.progress;
    if (data.currentPage && reading.book.pageCount) {
      progress = (data.currentPage / reading.book.pageCount) * 100;
    }

    const updates: any = { ...data };
    if (progress !== undefined) {
      updates.progress = Math.min(100, Math.max(0, progress));
    }
    if (data.isFinished) {
      updates.finishedAt = new Date();
      updates.progress = 100;
    }

    return prisma.bookClubReadingProgress.upsert({
      where: {
        readingId_userId: { readingId, userId },
      },
      create: {
        readingId,
        userId,
        ...updates,
      },
      update: updates,
    });
  }

  /**
   * Create discussion
   */
  async createDiscussion(
    userId: string,
    clubId: string,
    data: {
      title: string;
      content: string;
      readingId?: string;
      discussionType?: DiscussionType;
    },
  ) {
    // Verify membership
    await this.verifyMembership(userId, clubId);

    const discussion = await prisma.bookClubDiscussion.create({
      data: {
        clubId,
        authorId: userId,
        title: data.title,
        content: data.content,
        readingId: data.readingId,
        discussionType: data.discussionType || DiscussionType.GENERAL,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        reading: {
          include: { book: true },
        },
        _count: {
          select: { replies: true },
        },
      },
    });

    // Notify club members (except author)
    await notificationService.notifyBookClubMembers(
      clubId,
      {
        title: "New discussion started",
        body: `${discussion.author.displayName} started "${data.title}"`,
        type: "BOOK_CLUB_DISCUSSION",
        actionUrl: `/book-clubs/${clubId}/discussions/${discussion.id}`,
      },
      userId,
    );

    return discussion;
  }

  /**
   * Reply to discussion
   */
  async replyToDiscussion(
    userId: string,
    discussionId: string,
    data: {
      content: string;
      parentId?: string;
    },
  ) {
    const discussion = await prisma.bookClubDiscussion.findUnique({
      where: { id: discussionId },
      include: { club: true },
    });

    if (!discussion) {
      throw new AppError("Discussion not found", 404, "DISCUSSION_NOT_FOUND");
    }

    if (discussion.isLocked) {
      throw new AppError("Discussion is locked", 400, "DISCUSSION_LOCKED");
    }

    // Verify membership
    await this.verifyMembership(userId, discussion.clubId);

    const reply = await prisma.bookClubDiscussionReply.create({
      data: {
        discussionId,
        authorId: userId,
        content: data.content,
        parentId: data.parentId,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        parent: {
          include: {
            author: {
              select: {
                id: true,
                username: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    return reply;
  }

  /**
   * Get club discussions
   */
  async getClubDiscussions(
    clubId: string,
    userId: string,
    options: {
      readingId?: string;
      page?: number;
      limit?: number;
      type?: DiscussionType;
    } = {},
  ) {
    await this.verifyMembership(userId, clubId);

    const { page = 1, limit = 20, readingId, type } = options;

    const where: any = { clubId };
    if (readingId) where.readingId = readingId;
    if (type) where.discussionType = type;

    const [discussions, total] = await Promise.all([
      prisma.bookClubDiscussion.findMany({
        where,
        include: {
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          reading: {
            include: { book: true },
          },
          _count: {
            select: { replies: true },
          },
        },
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.bookClubDiscussion.count({ where }),
    ]);

    return {
      discussions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get discussion with replies
   */
  async getDiscussionWithReplies(discussionId: string, userId: string) {
    const discussion = await prisma.bookClubDiscussion.findUnique({
      where: { id: discussionId },
      include: {
        club: true,
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        reading: {
          include: { book: true },
        },
        replies: {
          include: {
            author: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
            replies: {
              include: {
                author: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatarUrl: true,
                  },
                },
              },
              orderBy: { createdAt: "asc" },
            },
          },
          where: { parentId: null }, // Top-level replies only
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!discussion) {
      throw new AppError("Discussion not found", 404, "DISCUSSION_NOT_FOUND");
    }

    await this.verifyMembership(userId, discussion.clubId);

    return discussion;
  }

  /**
   * Search book clubs
   */
  async searchBookClubs(
    query: string,
    options: {
      page?: number;
      limit?: number;
      isPrivate?: boolean;
    } = {},
  ) {
    const { page = 1, limit = 20, isPrivate } = options;

    const where: any = {
      isActive: true,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
      ],
    };

    if (isPrivate !== undefined) {
      where.isPrivate = isPrivate;
    } else {
      where.isPrivate = false; // Only show public clubs by default
    }

    const [clubs, total] = await Promise.all([
      prisma.bookClub.findMany({
        where,
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          _count: {
            select: {
              members: { where: { status: MembershipStatus.ACTIVE } },
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.bookClub.count({ where }),
    ]);

    return {
      clubs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get user's book clubs
   */
  async getUserBookClubs(userId: string) {
    const memberships = await prisma.bookClubMember.findMany({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
      },
      include: {
        club: {
          include: {
            _count: {
              select: {
                members: { where: { status: MembershipStatus.ACTIVE } },
                discussions: true,
              },
            },
            readings: {
              where: { isActive: true },
              include: { book: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    return memberships.map((m) => ({
      ...m.club,
      userRole: m.role,
      joinedAt: m.joinedAt,
      currentReading: m.club.readings[0] || null,
    }));
  }

  // Private helper methods
  private async verifyMembership(userId: string, clubId: string) {
    const member = await prisma.bookClubMember.findUnique({
      where: {
        clubId_userId: { clubId, userId },
      },
    });

    if (!member || member.status !== MembershipStatus.ACTIVE) {
      throw new AppError("Not a member of this book club", 403, "NOT_MEMBER");
    }

    return member;
  }

  private async verifyPermissions(userId: string, clubId: string, allowedRoles: BookClubRole[]) {
    const member = await this.verifyMembership(userId, clubId);

    if (!allowedRoles.includes(member.role)) {
      throw new AppError("Insufficient permissions", 403, "INSUFFICIENT_PERMISSIONS");
    }

    return member;
  }

  private generateInviteCode(): string {
    return crypto.randomBytes(8).toString("hex").toUpperCase();
  }
}

export const bookClubService = new BookClubService();
