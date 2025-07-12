import { prisma } from "../db/client";
import { BookBox, BookCondition, BoxBook, ListType } from "../types";
import { AppError } from "../utils/app-error";
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

    return boxes;
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

    return prisma.bookBox.update({
      where: { id: boxId },
      data: updates,
    });
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
      data: { isActive: false },
    });
  }
}

export const boxService = new BoxService();
