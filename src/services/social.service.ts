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
   * Check follow status between users
   */
  async checkFollowStatus(followerId: string, followingId: string): Promise<Follow | null> {
    return prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId, followingId },
      },
    });
  }

  /**
   * Get user's social stats
   */
  async getUserSocialStats(userId: string): Promise<{
    followersCount: number;
    followingCount: number;
    reviewsCount: number;
    averageRating: number;
  }> {
    const cacheKey = `social:${userId}:stats`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const [followersCount, followingCount, reviewStats] = await Promise.all([
      prisma.follow.count({ where: { followingId: userId } }),
      prisma.follow.count({ where: { followerId: userId } }),
      prisma.review.aggregate({
        where: { userId },
        _count: true,
        _avg: { rating: true },
      }),
    ]);

    const stats = {
      followersCount,
      followingCount,
      reviewsCount: reviewStats._count,
      averageRating: reviewStats._avg.rating || 0,
    };

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(stats));

    return stats;
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
              location: true,
              createdAt: true,
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
              location: true,
              createdAt: true,
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

    // Clear user's social cache
    await this.clearSocialCache(userId);

    return review;
  }

  /**
   * Get book reviews
   */
  async getBookReviews(
    bookId: string,
    options: { page?: number; limit?: number; userId?: string } = {},
  ): Promise<{
    reviews: any[];
    total: number;
    page: number;
    totalPages: number;
    userReview?: Review | null;
  }> {
    const { page = 1, limit = 20, userId } = options;

    const [reviews, total, userReview] = await Promise.all([
      prisma.review.findMany({
        where: {
          bookId,
          isPublic: true,
          userId: userId ? { not: userId } : undefined, // Exclude user's own review from list
        },
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
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.review.count({
        where: {
          bookId,
          isPublic: true,
          userId: userId ? { not: userId } : undefined,
        },
      }),
      // Get user's own review separately if userId provided
      userId
        ? prisma.review.findUnique({
            where: { userId_bookId: { userId, bookId } },
          })
        : Promise.resolve(null),
    ]);

    return {
      reviews,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      userReview,
    };
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

    if (followingIds.length === 0) {
      return [];
    }

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
   * Get user's reading activity for profile
   */
  async getUserReadingActivity(userId: string, options: { limit?: number } = {}): Promise<any[]> {
    const { limit = 10 } = options;

    return prisma.userBook.findMany({
      where: {
        userId,
        isPublic: true,
      },
      include: {
        book: {
          select: {
            id: true,
            title: true,
            authors: true,
            thumbnailUrl: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
  }

  /**
   * Get mutual followers between two users
   */
  async getMutualFollowers(userId1: string, userId2: string): Promise<User[]> {
    const mutualFollowers = await prisma.$queryRaw<any[]>`
      SELECT DISTINCT u.id, u.username, u."displayName", u."avatarUrl"
      FROM users u
      JOIN follows f1 ON u.id = f1."followingId" AND f1."followerId" = ${userId1}
      JOIN follows f2 ON u.id = f2."followingId" AND f2."followerId" = ${userId2}
      WHERE u.id != ${userId1} AND u.id != ${userId2}
      LIMIT 10
    `;

    return mutualFollowers;
  }

  /**
   * Get reading compatibility score between users
   */
  async getReadingCompatibility(
    userId1: string,
    userId2: string,
  ): Promise<{
    score: number;
    commonBooks: number;
    commonGenres: string[];
  }> {
    // Get common books
    const commonBooks = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT b.id)::int as count
      FROM books b
      JOIN user_books ub1 ON b.id = ub1."bookId" AND ub1."userId" = ${userId1}
      JOIN user_books ub2 ON b.id = ub2."bookId" AND ub2."userId" = ${userId2}
    `;

    // Get common genres
    const commonGenres = await prisma.$queryRaw<{ genre: string }[]>`
      SELECT DISTINCT unnest(b.categories) as genre
      FROM books b
      JOIN user_books ub1 ON b.id = ub1."bookId" AND ub1."userId" = ${userId1}
      JOIN user_books ub2 ON b.id = ub2."bookId" AND ub2."userId" = ${userId2}
      WHERE array_length(b.categories, 1) > 0
      LIMIT 10
    `;

    const commonBooksCount = commonBooks[0]?.count || 0;
    const commonGenresList = commonGenres.map((g) => g.genre);

    // Calculate compatibility score (0-100)
    const bookScore = Math.min(commonBooksCount * 10, 60); // Max 60 points for books
    const genreScore = Math.min(commonGenresList.length * 5, 40); // Max 40 points for genres
    const score = Math.min(bookScore + genreScore, 100);

    return {
      score,
      commonBooks: commonBooksCount,
      commonGenres: commonGenresList,
    };
  }

  /**
   * Update book rating based on reviews
   */
  private async updateBookRating(bookId: string): Promise<void> {
    const result = await prisma.review.aggregate({
      where: { bookId, isPublic: true },
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

  /**
   * Get service health status
   */
  async getServiceHealth(): Promise<{ status: "healthy" | "unhealthy"; error?: string }> {
    try {
      // Test database connection
      await prisma.user.count();

      // Test Redis connection
      await redis.ping();

      return { status: "healthy" };
    } catch (error: any) {
      return {
        status: "unhealthy",
        error: error.message || "Social service error",
      };
    }
  }
}

export const socialService = new SocialService();
