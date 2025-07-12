import { prisma } from "../db/client";
import { ListType, UserBook, UserBookWithBook } from "../types";
import { AppError } from "../utils/app-error";
import { redis } from "../utils/redis";
import { bookService } from "./book.service";

export class LibraryService {
  /**
   * Add book to user's library
   */
  async addBookToLibrary(
    userId: string,
    googleId: string,
    listType: ListType,
  ): Promise<UserBookWithBook> {
    // Get or create book in our database
    let book = await bookService.getBookByGoogleId(googleId);
    if (!book) {
      throw new AppError("Book not found", 404, "BOOK_NOT_FOUND");
    }

    // Check if book already exists in user's library
    const existingUserBook = await prisma.userBook.findUnique({
      where: {
        userId_bookId: {
          userId,
          bookId: book.id,
        },
      },
    });

    if (existingUserBook) {
      // Update list type if different
      if (existingUserBook.listType !== listType) {
        return this.updateUserBook(existingUserBook.id, userId, { listType });
      }

      throw new AppError("Book already in library", 400, "BOOK_EXISTS");
    }

    // Create user book entry
    const userBook = await prisma.userBook.create({
      data: {
        userId,
        bookId: book.id,
        listType,
        dateStarted: listType === ListType.CURRENTLY_READING ? new Date() : null,
      },
      include: { book: true },
    });

    // Clear cache
    await this.clearUserLibraryCache(userId);

    return userBook;
  }

  /**
   * Update user book details
   */
  async updateUserBook(
    userBookId: string,
    userId: string,
    updates: Partial<Omit<UserBook, "id" | "createdAt" | "updatedAt" | "userId" | "bookId">>,
  ): Promise<UserBookWithBook> {
    // Verify ownership and include book relation
    const userBook = await prisma.userBook.findFirst({
      where: { id: userBookId, userId },
      include: { book: true }, // Include the book relation
    });

    if (!userBook) {
      throw new AppError("Book not found in library", 404, "USER_BOOK_NOT_FOUND");
    }

    // Handle special updates
    const data: any = { ...updates };

    // Auto-set dates based on list type changes
    if (updates.listType) {
      if (updates.listType === ListType.CURRENTLY_READING && !userBook.dateStarted) {
        data.dateStarted = new Date();
      } else if (updates.listType === ListType.READ && !userBook.dateFinished) {
        data.dateFinished = new Date();
        data.progress = 100;
      }
    }

    // Update progress percentage
    if (updates.currentPage && userBook.book.pageCount) {
      data.progress = (updates.currentPage / userBook.book.pageCount) * 100;
    }

    const updatedUserBook = await prisma.userBook.update({
      where: { id: userBookId },
      data,
      include: { book: true },
    });

    // Clear cache
    await this.clearUserLibraryCache(userId);

    return updatedUserBook;
  }

  /**
   * Remove book from library
   */
  async removeBookFromLibrary(userBookId: string, userId: string): Promise<void> {
    const result = await prisma.userBook.deleteMany({
      where: { id: userBookId, userId },
    });

    if (result.count === 0) {
      throw new AppError("Book not found in library", 404, "USER_BOOK_NOT_FOUND");
    }

    // Clear cache
    await this.clearUserLibraryCache(userId);
  }

  /**
   * Get user's library
   */
  async getUserLibrary(
    userId: string,
    options: {
      listType?: ListType;
      isFavorite?: boolean;
      search?: string;
      page?: number;
      limit?: number;
      sortBy?: "dateAdded" | "title" | "author" | "rating";
      sortOrder?: "asc" | "desc";
    } = {},
  ): Promise<{
    books: UserBookWithBook[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const {
      listType,
      isFavorite,
      search,
      page = 1,
      limit = 20,
      sortBy = "dateAdded",
      sortOrder = "desc",
    } = options;

    // Build where clause
    const where: any = { userId };
    if (listType) where.listType = listType;
    if (isFavorite !== undefined) where.isFavorite = isFavorite;
    if (search) {
      where.OR = [
        { book: { title: { contains: search, mode: "insensitive" } } },
        { book: { authors: { hasSome: [search] } } },
      ];
    }

    // Build order by
    const orderBy: any = {};
    switch (sortBy) {
      case "title":
        orderBy.book = { title: sortOrder };
        break;
      case "author":
        orderBy.book = { authors: sortOrder };
        break;
      case "rating":
        orderBy.rating = sortOrder;
        break;
      default:
        orderBy.createdAt = sortOrder;
    }

    // Get total count
    const total = await prisma.userBook.count({ where });

    // Get books
    const books = await prisma.userBook.findMany({
      where,
      include: { book: true },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      books,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get reading stats
   */
  async getUserStats(userId: string): Promise<{
    totalBooks: number;
    booksRead: number;
    currentlyReading: number;
    wantToRead: number;
    favorites: number;
    pagesRead: number;
    averageRating: number;
    readingStreak: number;
    genresRead: string[];
  }> {
    // Check cache
    const cacheKey = `user:${userId}:stats`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const [counts, books, ratings] = await Promise.all([
      // Get counts by list type
      prisma.userBook.groupBy({
        by: ["listType"],
        where: { userId },
        _count: true,
      }),
      // Get all user books for additional stats
      prisma.userBook.findMany({
        where: { userId },
        include: { book: true },
      }),
      // Get average rating
      prisma.userBook.aggregate({
        where: { userId, rating: { not: null } },
        _avg: { rating: true },
      }),
    ]);

    // Process counts
    const countMap = counts.reduce(
      (acc, item) => {
        acc[item.listType] = item._count;
        return acc;
      },
      {} as Record<ListType, number>,
    );

    // Calculate pages read
    const pagesRead = books
      .filter((ub) => ub.listType === ListType.READ && ub.book.pageCount)
      .reduce((sum, ub) => sum + (ub.book.pageCount || 0), 0);

    // Get unique genres
    const genresSet = new Set<string>();
    books.forEach((ub) => {
      ub.book.categories.forEach((cat) => genresSet.add(cat));
    });

    // Calculate reading streak (simplified - days with reading activity)
    const readingStreak = await this.calculateReadingStreak(userId);

    const stats = {
      totalBooks: books.length,
      booksRead: countMap[ListType.READ] || 0,
      currentlyReading: countMap[ListType.CURRENTLY_READING] || 0,
      wantToRead: countMap[ListType.WANT_TO_READ] || 0,
      favorites: books.filter((ub) => ub.isFavorite).length,
      pagesRead,
      averageRating: ratings._avg.rating || 0,
      readingStreak,
      genresRead: Array.from(genresSet).slice(0, 10),
    };

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(stats));

    return stats;
  }

  /**
   * Calculate reading streak
   */
  private async calculateReadingStreak(userId: string): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activities = await prisma.userBook.findMany({
      where: {
        userId,
        updatedAt: { gte: thirtyDaysAgo },
      },
      select: { updatedAt: true },
      orderBy: { updatedAt: "desc" },
    });

    if (activities.length === 0) return 0;

    // Count consecutive days with activity
    let streak = 0;
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    for (let i = 0; i < 30; i++) {
      const hasActivity = activities.some((a) => {
        const activityDate = new Date(a.updatedAt);
        activityDate.setHours(0, 0, 0, 0);
        return activityDate.getTime() === currentDate.getTime();
      });

      if (hasActivity) {
        streak++;
      } else if (streak > 0) {
        // Streak broken
        break;
      }

      currentDate.setDate(currentDate.getDate() - 1);
    }

    return streak;
  }

  /**
   * Clear user library cache
   */
  private async clearUserLibraryCache(userId: string): Promise<void> {
    const keys = await redis.keys(`user:${userId}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}

export const libraryService = new LibraryService();
