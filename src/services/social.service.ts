import { prisma } from "../db/client";
import { Follow, Review, User } from "../types";
import { AppError } from "../utils/app-error";
import { redis } from "../utils/redis";

export class SocialService {
  /**
   * Follow a user
   */
  async followUser(followerId: string, followingId: string): Promise<Follow> {
    if (followerId === followingId) {
      throw new AppError("Cannot follow yourself", 400, "SELF_FOLLOW");
    }

    // Check if already following
    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId, followingId },
      },
    });

    if (existingFollow) {
      throw new AppError("Already following this user", 400, "ALREADY_FOLLOWING");
    }

    const follow = await prisma.follow.create({
      data: { followerId, followingId },
    });

    // Clear cache
    await this.clearSocialCache(followerId);
    await this.clearSocialCache(followingId);

    return follow;
  }

  /**
   * Unfollow a user
   */
  async unfollowUser(followerId: string, followingId: string): Promise<void> {
    const result = await prisma.follow.deleteMany({
      where: { followerId, followingId },
    });

    if (result.count === 0) {
      throw new AppError("Not following this user", 400, "NOT_FOLLOWING");
    }

    // Clear cache
    await this.clearSocialCache(followerId);
    await this.clearSocialCache(followingId);
  }

  /**
   * Get user's followers
   */
  async getFollowers(
    userId: string,
    options: { page?: number; limit?: number } = {},
  ): Promise<{
    followers: User[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 20 } = options;

    const [followers, total] = await Promise.all([
      prisma.follow.findMany({
        where: { followingId: userId },
        include: {
          follower: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              bio: true,
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.follow.count({ where: { followingId: userId } }),
    ]);

    return {
      followers: followers.map((f) => f.follower) as User[],
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get users that a user is following
   */
  async getFollowing(
    userId: string,
    options: { page?: number; limit?: number } = {},
  ): Promise<{
    following: User[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 20 } = options;

    const [following, total] = await Promise.all([
      prisma.follow.findMany({
        where: { followerId: userId },
        include: {
          following: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              bio: true,
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.follow.count({ where: { followerId: userId } }),
    ]);

    return {
      following: following.map((f) => f.following) as User[],
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Create or update book review
   */
  async createOrUpdateReview(
    userId: string,
    bookId: string,
    data: {
      rating: number;
      content?: string;
      isPublic?: boolean;
    },
  ): Promise<Review> {
    const review = await prisma.review.upsert({
      where: {
        userId_bookId: { userId, bookId },
      },
      create: {
        userId,
        bookId,
        ...data,
      },
      update: data,
    });

    // Update book's average rating
    await this.updateBookRating(bookId);

    return review;
  }

  /**
   * Get activity feed
   */
  async getActivityFeed(
    userId: string,
    options: { page?: number; limit?: number } = {},
  ): Promise<any[]> {
    const { page = 1, limit = 20 } = options;

    // Get users that the current user follows
    const following = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });

    const followingIds = following.map((f) => f.followingId);
    followingIds.push(userId); // Include own activities

    // Get recent activities from followed users
    const activities = await prisma.$queryRaw<any[]>`
    SELECT 
      'book_added' as type,
      ub.id,
      ub."userId",
      u.username,
      u."displayName",
      u."avatarUrl",
      ub."createdAt",
      ub."listType",
      b.id as "bookId",
      b.title as "bookTitle",
      b."thumbnailUrl" as "bookThumbnail",
      b.authors as "bookAuthors",
      null as rating,
      null as content
    FROM user_books ub
    JOIN users u ON ub."userId" = u.id
    JOIN books b ON ub."bookId" = b.id
    WHERE ub."userId" = ANY(${followingIds})
      AND ub."isPublic" = true
      AND ub."createdAt" > NOW() - INTERVAL '30 days'
    
    UNION ALL
    
    SELECT 
      'review_added' as type,
      r.id,
      r."userId",
      u.username,
      u."displayName",
      u."avatarUrl",
      r."createdAt",
      null as "listType",
      b.id as "bookId",
      b.title as "bookTitle",
      b."thumbnailUrl" as "bookThumbnail",
      b.authors as "bookAuthors",
      r.rating,
      r.content
    FROM reviews r
    JOIN users u ON r."userId" = u.id
    JOIN books b ON r."bookId" = b.id
    WHERE r."userId" = ANY(${followingIds})
      AND r."isPublic" = true
      AND r."createdAt" > NOW() - INTERVAL '30 days'
    
    ORDER BY "createdAt" DESC
    LIMIT ${limit}
    OFFSET ${(page - 1) * limit}
  `;

    return activities;
  }

  /**
   * Search users
   */
  async searchUsers(
    query: string,
    options: { page?: number; limit?: number } = {},
  ): Promise<{
    users: User[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 20 } = options;

    const where = {
      OR: [
        { username: { contains: query, mode: "insensitive" as const } },
        { displayName: { contains: query, mode: "insensitive" as const } },
        { fullName: { contains: query, mode: "insensitive" as const } },
      ],
      isEmailVerified: true,
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          displayName: true,
          fullName: true,
          avatarUrl: true,
          bio: true,
          location: true,
          createdAt: true,
          _count: {
            select: {
              followers: true,
              following: true,
              books: true,
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      users: users as any,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Update book rating based on reviews
   */
  private async updateBookRating(bookId: string): Promise<void> {
    const result = await prisma.review.aggregate({
      where: { bookId },
      _avg: { rating: true },
      _count: true,
    });

    await prisma.book.update({
      where: { id: bookId },
      data: {
        averageRating: result._avg.rating || 0,
        ratingsCount: result._count,
      },
    });
  }

  /**
   * Clear social cache for a user
   */
  private async clearSocialCache(userId: string): Promise<void> {
    const keys = await redis.keys(`social:${userId}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}

export const socialService = new SocialService();
