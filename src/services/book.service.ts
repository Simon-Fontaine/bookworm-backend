import { config } from "../config";
import { prisma } from "../db/client";
import { Book, BookSearchResult } from "../types";
import { AppError } from "../utils/app-error";
import { redis } from "../utils/redis";
import axios from "axios";

export class BookService {
  private googleBooksApi = "https://www.googleapis.com/books/v1/volumes";

  /**
   * Search books using Google Books API
   */
  async searchBooks(
    query: string,
    options: {
      startIndex?: number;
      maxResults?: number;
      orderBy?: "relevance" | "newest";
      filter?: string;
      langRestrict?: string;
    } = {},
  ): Promise<BookSearchResult[]> {
    const { startIndex = 0, maxResults = 20, orderBy = "relevance", langRestrict = "en" } = options;

    // Check cache first
    const cacheKey = `books:search:${JSON.stringify({ query, ...options })}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    try {
      const response = await axios.get(this.googleBooksApi, {
        params: {
          q: query,
          startIndex,
          maxResults,
          orderBy,
          langRestrict,
          key: config.GOOGLE_BOOKS_API_KEY,
        },
      });

      const books: BookSearchResult[] = (response.data.items || []).map((item: any) => ({
        id: item.id,
        title: item.volumeInfo.title,
        authors: item.volumeInfo.authors || [],
        description: item.volumeInfo.description,
        thumbnailUrl: item.volumeInfo.imageLinks?.thumbnail?.replace("http://", "https://"),
        publishedDate: item.volumeInfo.publishedDate,
        pageCount: item.volumeInfo.pageCount,
        categories: item.volumeInfo.categories || [],
        averageRating: item.volumeInfo.averageRating,
        ratingsCount: item.volumeInfo.ratingsCount,
      }));

      // Cache for 1 hour
      await redis.setex(cacheKey, 3600, JSON.stringify(books));

      return books;
    } catch (error) {
      console.error("Google Books API error:", error);
      throw new AppError("Failed to search books", 500, "GOOGLE_BOOKS_ERROR");
    }
  }

  /**
   * Get book details by Google Books ID
   */
  async getBookByGoogleId(googleId: string): Promise<Book | null> {
    // Check our database first
    const existingBook = await prisma.book.findUnique({
      where: { googleId },
    });

    if (existingBook) {
      return existingBook;
    }

    // Fetch from Google Books API
    try {
      const response = await axios.get(`${this.googleBooksApi}/${googleId}`, {
        params: { key: config.GOOGLE_BOOKS_API_KEY },
      });

      const volumeInfo = response.data.volumeInfo;

      // Save to our database
      const book = await prisma.book.create({
        data: {
          googleId,
          title: volumeInfo.title,
          authors: volumeInfo.authors || [],
          description: volumeInfo.description,
          thumbnailUrl: volumeInfo.imageLinks?.thumbnail?.replace("http://", "https://"),
          publishedDate: volumeInfo.publishedDate ? new Date(volumeInfo.publishedDate) : null,
          pageCount: volumeInfo.pageCount,
          categories: volumeInfo.categories || [],
          isbn10: volumeInfo.industryIdentifiers?.find((id: any) => id.type === "ISBN_10")
            ?.identifier,
          isbn13: volumeInfo.industryIdentifiers?.find((id: any) => id.type === "ISBN_13")
            ?.identifier,
          language: volumeInfo.language || "en",
          averageRating: volumeInfo.averageRating,
          ratingsCount: volumeInfo.ratingsCount,
        },
      });

      return book;
    } catch (error) {
      console.error("Google Books API error:", error);
      return null;
    }
  }

  /**
   * Get trending books
   */
  async getTrendingBooks(category?: string, limit: number = 20): Promise<BookSearchResult[]> {
    const query = category ? `subject:${category} bestseller` : "bestseller";
    return this.searchBooks(query, { maxResults: limit });
  }

  /**
   * Get new releases
   */
  async getNewReleases(category?: string, limit: number = 20): Promise<BookSearchResult[]> {
    const currentYear = new Date().getFullYear();
    const query = category
      ? `subject:${category} publishedDate:${currentYear}`
      : `publishedDate:${currentYear}`;

    return this.searchBooks(query, {
      maxResults: limit,
      orderBy: "newest",
    });
  }

  /**
   * Get book recommendations for a user
   */
  async getRecommendations(userId: string, limit: number = 20): Promise<BookSearchResult[]> {
    // Get user's reading history
    const userBooks = await prisma.userBook.findMany({
      where: { userId },
      include: { book: true },
      orderBy: { updatedAt: "desc" },
      take: 10,
    });

    if (userBooks.length === 0) {
      // Return popular books for new users
      return this.getTrendingBooks(undefined, limit);
    }

    // Extract categories and authors from user's books
    const categories = new Set<string>();
    const authors = new Set<string>();

    userBooks.forEach((ub) => {
      ub.book.categories.forEach((cat) => categories.add(cat));
      ub.book.authors.forEach((author) => authors.add(author));
    });

    // Build recommendation query
    const categoryArray = Array.from(categories).slice(0, 3);
    const authorArray = Array.from(authors).slice(0, 3);

    const query = [
      ...categoryArray.map((cat) => `subject:${cat}`),
      ...authorArray.map((author) => `inauthor:${author}`),
    ].join(" OR ");

    if (!query) {
      return this.getTrendingBooks(undefined, limit);
    }

    const recommendations = await this.searchBooks(query, { maxResults: limit });

    // Filter out books the user already has
    const userBookIds = new Set(userBooks.map((ub) => ub.book.googleId));
    return recommendations.filter((book) => !userBookIds.has(book.id));
  }

  /**
   * Scan book by ISBN (barcode)
   */
  async scanBookByISBN(isbn: string): Promise<Book | null> {
    // Clean ISBN
    const cleanISBN = isbn.replace(/[^0-9X]/gi, "");

    // Check database first
    const existingBook = await prisma.book.findFirst({
      where: {
        OR: [{ isbn10: cleanISBN }, { isbn13: cleanISBN }],
      },
    });

    if (existingBook) {
      return existingBook;
    }

    // Search Google Books by ISBN
    const results = await this.searchBooks(`isbn:${cleanISBN}`, {
      maxResults: 1,
    });

    if (results.length === 0) {
      return null;
    }

    // Get full book details
    return this.getBookByGoogleId(results[0].id);
  }
}

export const bookService = new BookService();
