import { prisma } from "../db/client";
import { BookBox, BookCondition, BoxBook, ListType } from "../types";
import { AppError } from "../utils/app-error";
import { redis } from "../utils/redis";
import { bookService } from "./book.service";

export class BoxService {
  /**
   * Create a new book box
   */
  async createBox(
    userId: string,
    data: {
      name: string;
      description?: string;
      latitude: number;
      longitude: number;
      address: string;
      accessHours?: string;
      rules?: string;
      contactInfo?: string;
    },
  ): Promise<BookBox> {
    // Check for duplicate boxes at same location
    const existingBox = await prisma.bookBox.findFirst({
      where: {
        latitude: {
          gte: data.latitude - 0.0001,
          lte: data.latitude + 0.0001,
        },
        longitude: {
          gte: data.longitude - 0.0001,
          lte: data.longitude + 0.0001,
        },
        isActive: true,
      },
    });

    if (existingBox) {
      throw new AppError("A book box already exists at this location", 400, "DUPLICATE_LOCATION");
    }

    const box = await prisma.bookBox.create({
      data: {
        ...data,
        creatorId: userId,
        isActive: true,
        isVerified: false,
      },
    });

    // Log activity
    await prisma.boxActivity.create({
      data: {
        boxId: box.id,
        userId,
        activityType: "box_created",
      },
    });

    // Clear cache
    await this.clearBoxCache();

    return box;
  }

  /**
   * Find nearby book boxes
   */
  async findNearbyBoxes(
    latitude: number,
    longitude: number,
    radiusKm: number = 10,
  ): Promise<any[]> {
    // Check cache first
    const cacheKey = `boxes:nearby:${latitude.toFixed(3)}:${longitude.toFixed(3)}:${radiusKm}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Use Haversine formula for distance calculation
    // This is a simplified version - in production, use PostGIS
    const boxes = await prisma.$queryRaw<any[]>`
      SELECT 
        b.*,
        u.username as creator_username,
        u."displayName" as creator_display_name,
        COUNT(DISTINCT bb.id) FILTER (WHERE bb."isAvailable" = true) as available_books,
        COUNT(DISTINCT bb.id) as total_books,
        (
          6371 * acos(
            cos(radians(${latitude})) * 
            cos(radians(b.latitude)) * 
            cos(radians(b.longitude) - radians(${longitude})) + 
            sin(radians(${latitude})) * 
            sin(radians(b.latitude))
          )
        ) as distance
      FROM book_boxes b
      LEFT JOIN users u ON b."creatorId" = u.id
      LEFT JOIN box_books bb ON b.id = bb."boxId"
      WHERE 
        b."isActive" = true AND
        (
          6371 * acos(
            cos(radians(${latitude})) * 
            cos(radians(b.latitude)) * 
            cos(radians(b.longitude) - radians(${longitude})) + 
            sin(radians(${latitude})) * 
            sin(radians(b.latitude))
          )
        ) <= ${radiusKm}
      GROUP BY b.id, u.id
      ORDER BY distance ASC
    `;

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(boxes));

    return boxes;
  }

  /**
   * Search book boxes
   */
  async searchBoxes(
    query: string,
    options: {
      latitude?: number;
      longitude?: number;
      radius?: number;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{
    boxes: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const { latitude, longitude, radius = 50, page = 1, limit = 20 } = options;

    let whereCondition = `
      WHERE b."isActive" = true 
      AND (
        b.name ILIKE '%${query}%' 
        OR b.description ILIKE '%${query}%'
        OR b.address ILIKE '%${query}%'
      )
    `;

    let orderBy = `ORDER BY b."createdAt" DESC`;

    // Add distance filtering if coordinates provided
    if (latitude && longitude) {
      whereCondition += ` AND (
        6371 * acos(
          cos(radians(${latitude})) * 
          cos(radians(b.latitude)) * 
          cos(radians(b.longitude) - radians(${longitude})) + 
          sin(radians(${latitude})) * 
          sin(radians(b.latitude))
        )
      ) <= ${radius}`;

      orderBy = `ORDER BY (
        6371 * acos(
          cos(radians(${latitude})) * 
          cos(radians(b.latitude)) * 
          cos(radians(b.longitude) - radians(${longitude})) + 
          sin(radians(${latitude})) * 
          sin(radians(b.latitude))
        )
      ) ASC`;
    }

    const [boxes, totalResult] = await Promise.all([
      prisma.$queryRaw<any[]>`
        SELECT 
          b.*,
          u.username as creator_username,
          u."displayName" as creator_display_name,
          COUNT(DISTINCT bb.id) FILTER (WHERE bb."isAvailable" = true) as available_books,
          COUNT(DISTINCT bb.id) as total_books
          ${
            latitude && longitude
              ? `, (
            6371 * acos(
              cos(radians(${latitude})) * 
              cos(radians(b.latitude)) * 
              cos(radians(b.longitude) - radians(${longitude})) + 
              sin(radians(${latitude})) * 
              sin(radians(b.latitude))
            )
          ) as distance`
              : ""
          }
        FROM book_boxes b
        LEFT JOIN users u ON b."creatorId" = u.id
        LEFT JOIN box_books bb ON b.id = bb."boxId"
        ${whereCondition}
        GROUP BY b.id, u.id
        ${orderBy}
        LIMIT ${limit}
        OFFSET ${(page - 1) * limit}
      `,
      prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(DISTINCT b.id)::int as count
        FROM book_boxes b
        ${whereCondition.replace('LEFT JOIN users u ON b."creatorId" = u.id LEFT JOIN box_books bb ON b.id = bb."boxId"', "")}
      `,
    ]);

    const total = totalResult[0]?.count || 0;

    return {
      boxes,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get box details with books
   */
  async getBoxDetails(boxId: string): Promise<any> {
    const box = await prisma.bookBox.findUnique({
      where: { id: boxId },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        books: {
          where: { isAvailable: true },
          include: {
            book: true,
          },
          orderBy: { dateAdded: "desc" },
        },
        activities: {
          take: 10,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!box) {
      throw new AppError("Book box not found", 404, "BOX_NOT_FOUND");
    }

    return box;
  }

  /**
   * Add book to box
   */
  async addBookToBox(
    userId: string,
    boxId: string,
    googleId: string,
    condition: BookCondition = BookCondition.GOOD,
    notes?: string,
  ): Promise<BoxBook> {
    // Get or create book
    const book = await bookService.getBookByGoogleId(googleId);
    if (!book) {
      throw new AppError("Book not found", 404, "BOOK_NOT_FOUND");
    }

    // Check if box exists
    const box = await prisma.bookBox.findUnique({
      where: { id: boxId },
    });

    if (!box || !box.isActive) {
      throw new AppError("Book box not found", 404, "BOX_NOT_FOUND");
    }

    // Add book to box
    const boxBook = await prisma.boxBook.create({
      data: {
        boxId,
        bookId: book.id,
        donorId: userId,
        condition,
        notes,
        isAvailable: true,
      },
    });

    // Log activity
    await prisma.boxActivity.create({
      data: {
        boxId,
        userId,
        bookId: book.id,
        activityType: "book_added",
        metadata: { condition, notes },
      },
    });

    // Clear cache
    await this.clearBoxCache();

    return boxBook;
  }

  /**
   * Take book from box
   */
  async takeBookFromBox(userId: string, boxBookId: string): Promise<void> {
    const boxBook = await prisma.boxBook.findUnique({
      where: { id: boxBookId },
      include: { book: true },
    });

    if (!boxBook || !boxBook.isAvailable) {
      throw new AppError("Book not available", 404, "BOOK_NOT_AVAILABLE");
    }

    // Update box book
    await prisma.boxBook.update({
      where: { id: boxBookId },
      data: {
        isAvailable: false,
        dateTaken: new Date(),
        takenById: userId,
      },
    });

    // Log activity
    await prisma.boxActivity.create({
      data: {
        boxId: boxBook.boxId,
        userId,
        bookId: boxBook.bookId,
        activityType: "book_taken",
      },
    });

    // Optionally add to user's library
    try {
      await prisma.userBook.create({
        data: {
          userId,
          bookId: boxBook.bookId,
          listType: ListType.WANT_TO_READ,
          notes: `Taken from a book box`,
        },
      });
    } catch (error) {
      // Ignore if already in library
    }

    // Clear cache
    await this.clearBoxCache();
  }

  /**
   * Update box details
   */
  async updateBox(userId: string, boxId: string, updates: Partial<BookBox>): Promise<BookBox> {
    // Verify ownership
    const box = await prisma.bookBox.findFirst({
      where: { id: boxId, creatorId: userId },
    });

    if (!box) {
      throw new AppError("Box not found or unauthorized", 404, "BOX_NOT_FOUND");
    }

    const updatedBox = await prisma.bookBox.update({
      where: { id: boxId },
      data: {
        ...updates,
        updatedAt: new Date(),
      },
    });

    // Clear cache
    await this.clearBoxCache();

    return updatedBox;
  }

  /**
   * Delete box (soft delete)
   */
  async deleteBox(userId: string, boxId: string): Promise<void> {
    const box = await prisma.bookBox.findFirst({
      where: { id: boxId, creatorId: userId },
    });

    if (!box) {
      throw new AppError("Box not found or unauthorized", 404, "BOX_NOT_FOUND");
    }

    await prisma.bookBox.update({
      where: { id: boxId },
      data: { isActive: false, updatedAt: new Date() },
    });

    // Clear cache
    await this.clearBoxCache();
  }

  /**
   * Get user's book boxes
   */
  async getUserBoxes(
    userId: string,
    options: { page?: number; limit?: number; includeInactive?: boolean } = {},
  ): Promise<{
    boxes: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 20, includeInactive = false } = options;

    const where = {
      creatorId: userId,
      isActive: includeInactive ? undefined : true,
    };

    const [boxes, total] = await Promise.all([
      prisma.bookBox.findMany({
        where,
        include: {
          _count: {
            select: {
              books: {
                where: { isAvailable: true },
              },
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.bookBox.count({ where }),
    ]);

    return {
      boxes: boxes.map((box) => ({
        ...box,
        availableBooksCount: box._count.books,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get box activity history
   */
  async getBoxActivity(
    boxId: string,
    options: { page?: number; limit?: number } = {},
  ): Promise<{
    activities: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 20 } = options;

    const [activities, total] = await Promise.all([
      prisma.boxActivity.findMany({
        where: { boxId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          book: {
            select: {
              id: true,
              title: true,
              authors: true,
              thumbnailUrl: true,
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.boxActivity.count({ where: { boxId } }),
    ]);

    return {
      activities,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get box statistics
   */
  async getBoxStats(boxId: string): Promise<{
    totalBooks: number;
    availableBooks: number;
    takenBooks: number;
    uniqueDonors: number;
    recentActivity: any[];
  }> {
    const cacheKey = `box:${boxId}:stats`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const [bookStats, donorStats, recentActivity] = await Promise.all([
      prisma.boxBook.groupBy({
        by: ["isAvailable"],
        where: { boxId },
        _count: true,
      }),
      prisma.boxBook.findMany({
        where: { boxId },
        select: { donorId: true },
        distinct: ["donorId"],
      }),
      prisma.boxActivity.findMany({
        where: { boxId },
        include: {
          user: {
            select: {
              username: true,
              displayName: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    const availableBooks = bookStats.find((s) => s.isAvailable)?._count || 0;
    const takenBooks = bookStats.find((s) => !s.isAvailable)?._count || 0;
    const totalBooks = availableBooks + takenBooks;
    const uniqueDonors = donorStats.length;

    const stats = {
      totalBooks,
      availableBooks,
      takenBooks,
      uniqueDonors,
      recentActivity,
    };

    // Cache for 10 minutes
    await redis.setex(cacheKey, 600, JSON.stringify(stats));

    return stats;
  }

  /**
   * Get popular book boxes
   */
  async getPopularBoxes(
    options: {
      latitude?: number;
      longitude?: number;
      radius?: number;
      limit?: number;
    } = {},
  ): Promise<any[]> {
    const { latitude, longitude, radius = 100, limit = 10 } = options;

    let distanceFilter = "";
    if (latitude && longitude) {
      distanceFilter = `AND (
        6371 * acos(
          cos(radians(${latitude})) * 
          cos(radians(b.latitude)) * 
          cos(radians(b.longitude) - radians(${longitude})) + 
          sin(radians(${latitude})) * 
          sin(radians(b.latitude))
        )
      ) <= ${radius}`;
    }

    const boxes = await prisma.$queryRaw<any[]>`
      SELECT 
        b.*,
        u.username as creator_username,
        u."displayName" as creator_display_name,
        COUNT(DISTINCT bb.id) as total_books,
        COUNT(DISTINCT ba.id) as activity_count,
        COUNT(DISTINCT bb.id) FILTER (WHERE bb."isAvailable" = true) as available_books
      FROM book_boxes b
      LEFT JOIN users u ON b."creatorId" = u.id
      LEFT JOIN box_books bb ON b.id = bb."boxId"
      LEFT JOIN box_activities ba ON b.id = ba."boxId" AND ba."createdAt" > NOW() - INTERVAL '30 days'
      WHERE b."isActive" = true ${distanceFilter}
      GROUP BY b.id, u.id
      HAVING COUNT(DISTINCT bb.id) > 0 OR COUNT(DISTINCT ba.id) > 0
      ORDER BY (COUNT(DISTINCT bb.id) + COUNT(DISTINCT ba.id)) DESC
      LIMIT ${limit}
    `;

    return boxes;
  }

  /**
   * Clear box cache
   */
  private async clearBoxCache(): Promise<void> {
    const keys = await redis.keys("boxes:*");
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
      await prisma.bookBox.count();

      // Test Redis connection
      await redis.ping();

      return { status: "healthy" };
    } catch (error: any) {
      return {
        status: "unhealthy",
        error: error.message || "Box service error",
      };
    }
  }

  /**
   * Validate box location
   */
  async validateBoxLocation(
    latitude: number,
    longitude: number,
  ): Promise<{
    isValid: boolean;
    error?: string;
    nearbyBoxes?: any[];
  }> {
    // Check for boxes within 50 meters
    const nearbyBoxes = await prisma.$queryRaw<any[]>`
      SELECT 
        b.*,
        (
          6371000 * acos(
            cos(radians(${latitude})) * 
            cos(radians(b.latitude)) * 
            cos(radians(b.longitude) - radians(${longitude})) + 
            sin(radians(${latitude})) * 
            sin(radians(b.latitude))
          )
        ) as distance_meters
      FROM book_boxes b
      WHERE 
        b."isActive" = true AND
        (
          6371000 * acos(
            cos(radians(${latitude})) * 
            cos(radians(b.latitude)) * 
            cos(radians(b.longitude) - radians(${longitude})) + 
            sin(radians(${latitude})) * 
            sin(radians(b.latitude))
          )
        ) <= 50
    `;

    if (nearbyBoxes.length > 0) {
      return {
        isValid: false,
        error: "A book box already exists within 50 meters of this location",
        nearbyBoxes,
      };
    }

    return { isValid: true };
  }
}

export const boxService = new BoxService();
