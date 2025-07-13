import { prisma } from "../db/client";
import { redis } from "../utils/redis";

export class AnalyticsService {
  /**
   * Get comprehensive reading insights
   */
  async getReadingInsights(userId: string, year?: number) {
    const currentYear = year || new Date().getFullYear();
    const cacheKey = `insights:${userId}:${currentYear}`;

    // Check cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const insights = await Promise.all([
      this.getReadingVelocity(userId, currentYear),
      this.getGenreDistribution(userId, currentYear),
      this.getPageCountAnalysis(userId, currentYear),
      this.getReadingStreaks(userId),
      this.getAuthorDiversity(userId, currentYear),
      this.getSeasonalPatterns(userId),
      this.getCompletionRate(userId, currentYear),
      this.getReadingGoalProgress(userId, currentYear),
    ]);

    const result = {
      year: currentYear,
      velocity: insights[0],
      genres: insights[1],
      pageAnalysis: insights[2],
      streaks: insights[3],
      authorDiversity: insights[4],
      seasonalPatterns: insights[5],
      completionRate: insights[6],
      goalProgress: insights[7],
      lastUpdated: new Date().toISOString(),
    };

    // Cache for 1 hour
    await redis.setex(cacheKey, 3600, JSON.stringify(result));
    return result;
  }

  /**
   * Get reading velocity metrics
   */
  private async getReadingVelocity(userId: string, year: number) {
    const monthlyData = await prisma.$queryRaw<any[]>`
      SELECT 
        EXTRACT(MONTH FROM date_finished) as month,
        COUNT(*)::int as books_finished,
        COALESCE(SUM(b.page_count), 0)::int as pages_read,
        ROUND(AVG(b.page_count), 0)::int as avg_pages_per_book
      FROM user_books ub
      JOIN books b ON ub.book_id = b.id
      WHERE ub.user_id = ${userId} 
        AND ub.list_type = 'READ_LIST'
        AND ub.date_finished IS NOT NULL
        AND EXTRACT(YEAR FROM ub.date_finished) = ${year}
      GROUP BY EXTRACT(MONTH FROM ub.date_finished)
      ORDER BY month
    `;

    const totalBooks = monthlyData.reduce((sum, month) => sum + month.books_finished, 0);
    const totalPages = monthlyData.reduce((sum, month) => sum + month.pages_read, 0);

    return {
      monthlyData,
      totalBooks,
      totalPages,
      averageBooksPerMonth: totalBooks > 0 ? Math.round((totalBooks / 12) * 10) / 10 : 0,
      averagePagesPerDay: totalPages > 0 ? Math.round((totalPages / 365) * 10) / 10 : 0,
      averagePagesPerBook: totalBooks > 0 ? Math.round(totalPages / totalBooks) : 0,
    };
  }

  /**
   * Get genre distribution
   */
  private async getGenreDistribution(userId: string, year: number) {
    const genreData = await prisma.$queryRaw<any[]>`
      SELECT 
        unnest(b.categories) as genre,
        COUNT(*)::int as count,
        ROUND(AVG(ub.rating), 1) as avg_rating
      FROM user_books ub
      JOIN books b ON ub.book_id = b.id
      WHERE ub.user_id = ${userId}
        AND ub.list_type = 'READ_LIST'
        AND (ub.date_finished IS NULL OR EXTRACT(YEAR FROM ub.date_finished) = ${year})
        AND array_length(b.categories, 1) > 0
      GROUP BY unnest(b.categories)
      ORDER BY count DESC
      LIMIT 15
    `;

    const totalBooks = genreData.reduce((sum, genre) => sum + genre.count, 0);

    return {
      genres: genreData.map((g) => ({
        ...g,
        percentage: totalBooks > 0 ? Math.round((g.count / totalBooks) * 100) : 0,
      })),
      totalGenres: genreData.length,
      favoriteGenre: genreData[0]?.genre || null,
    };
  }

  /**
   * Get page count analysis
   */
  private async getPageCountAnalysis(userId: string, year: number) {
    const pageAnalysis = await prisma.$queryRaw<any[]>`
      SELECT 
        CASE 
          WHEN b.page_count <= 200 THEN 'Short (≤200)'
          WHEN b.page_count <= 400 THEN 'Medium (201-400)'
          WHEN b.page_count <= 600 THEN 'Long (401-600)'
          ELSE 'Very Long (>600)'
        END as category,
        COUNT(*)::int as count,
        ROUND(AVG(ub.rating), 1) as avg_rating
      FROM user_books ub
      JOIN books b ON ub.book_id = b.id
      WHERE ub.user_id = ${userId}
        AND ub.list_type = 'READ_LIST'
        AND b.page_count IS NOT NULL
        AND (ub.date_finished IS NULL OR EXTRACT(YEAR FROM ub.date_finished) = ${year})
      GROUP BY 
        CASE 
          WHEN b.page_count <= 200 THEN 'Short (≤200)'
          WHEN b.page_count <= 400 THEN 'Medium (201-400)'
          WHEN b.page_count <= 600 THEN 'Long (401-600)'
          ELSE 'Very Long (>600)'
        END
      ORDER BY count DESC
    `;

    return {
      distribution: pageAnalysis,
      preference: pageAnalysis[0]?.category || null,
    };
  }

  /**
   * Calculate reading streaks
   */
  private async getReadingStreaks(userId: string) {
    const readingDates = await prisma.$queryRaw<any[]>`
      SELECT DISTINCT DATE(ub.date_finished) as reading_date
      FROM user_books ub
      WHERE ub.user_id = ${userId}
        AND ub.list_type = 'READ_LIST'
        AND ub.date_finished IS NOT NULL
        AND ub.date_finished >= NOW() - INTERVAL '90 days'
      ORDER BY reading_date DESC
    `;

    let currentStreak = 0;
    let longestStreak = 0;
    let streakCount = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < readingDates.length; i++) {
      const readingDate = new Date(readingDates[i].reading_date);
      const expectedDate = new Date(today);
      expectedDate.setDate(expectedDate.getDate() - i);

      if (readingDate.getTime() === expectedDate.getTime()) {
        streakCount++;
        if (i === 0) currentStreak = streakCount;
      } else {
        longestStreak = Math.max(longestStreak, streakCount);
        streakCount = 0;
      }
    }

    longestStreak = Math.max(longestStreak, streakCount);

    return {
      currentStreak,
      longestStreak,
      recentReadingDays: readingDates.length,
    };
  }

  /**
   * Get author diversity
   */
  private async getAuthorDiversity(userId: string, year: number) {
    const authorData = await prisma.$queryRaw<any[]>`
      SELECT 
        unnest(b.authors) as author,
        COUNT(*)::int as books_read,
        ROUND(AVG(ub.rating), 1) as avg_rating
      FROM user_books ub
      JOIN books b ON ub.book_id = b.id
      WHERE ub.user_id = ${userId}
        AND ub.list_type = 'READ_LIST'
        AND (ub.date_finished IS NULL OR EXTRACT(YEAR FROM ub.date_finished) = ${year})
        AND array_length(b.authors, 1) > 0
      GROUP BY unnest(b.authors)
      ORDER BY books_read DESC
      LIMIT 20
    `;

    const totalBooks = authorData.reduce((sum, author) => sum + author.books_read, 0);
    const uniqueAuthors = authorData.length;

    return {
      topAuthors: authorData.slice(0, 10),
      totalUniqueAuthors: uniqueAuthors,
      diversityScore: totalBooks > 0 ? Math.round((uniqueAuthors / totalBooks) * 100) : 0,
      favoriteAuthor: authorData[0]?.author || null,
    };
  }

  /**
   * Get seasonal reading patterns
   */
  private async getSeasonalPatterns(userId: string) {
    const seasonalData = await prisma.$queryRaw<any[]>`
      SELECT 
        CASE 
          WHEN EXTRACT(MONTH FROM date_finished) IN (12, 1, 2) THEN 'Winter'
          WHEN EXTRACT(MONTH FROM date_finished) IN (3, 4, 5) THEN 'Spring'
          WHEN EXTRACT(MONTH FROM date_finished) IN (6, 7, 8) THEN 'Summer'
          WHEN EXTRACT(MONTH FROM date_finished) IN (9, 10, 11) THEN 'Fall'
        END as season,
        COUNT(*)::int as books_read,
        ROUND(AVG(b.page_count), 0)::int as avg_pages
      FROM user_books ub
      JOIN books b ON ub.book_id = b.id
      WHERE ub.user_id = ${userId}
        AND ub.list_type = 'READ_LIST'
        AND ub.date_finished IS NOT NULL
        AND ub.date_finished >= NOW() - INTERVAL '2 years'
      GROUP BY 
        CASE 
          WHEN EXTRACT(MONTH FROM date_finished) IN (12, 1, 2) THEN 'Winter'
          WHEN EXTRACT(MONTH FROM date_finished) IN (3, 4, 5) THEN 'Spring'
          WHEN EXTRACT(MONTH FROM date_finished) IN (6, 7, 8) THEN 'Summer'
          WHEN EXTRACT(MONTH FROM date_finished) IN (9, 10, 11) THEN 'Fall'
        END
      ORDER BY books_read DESC
    `;

    return {
      seasonalDistribution: seasonalData,
      mostProductiveSeason: seasonalData[0]?.season || null,
    };
  }

  /**
   * Get completion rate
   */
  private async getCompletionRate(userId: string, year: number) {
    const completionData = await prisma.$queryRaw<any[]>`
      SELECT 
        ub.list_type,
        COUNT(*)::int as count
      FROM user_books ub
      WHERE ub.user_id = ${userId}
        AND EXTRACT(YEAR FROM ub.created_at) = ${year}
      GROUP BY ub.list_type
    `;

    const started = completionData.find((d) => d.list_type === "CURRENTLY_READING")?.count || 0;
    const finished = completionData.find((d) => d.list_type === "READ_LIST")?.count || 0;
    const abandoned = 0; // You might want to add a "DID_NOT_FINISH" status

    const total = started + finished + abandoned;
    const completionRate = total > 0 ? Math.round((finished / total) * 100) : 0;

    return {
      started,
      finished,
      abandoned,
      completionRate,
    };
  }

  /**
   * Get reading goal progress
   */
  private async getReadingGoalProgress(userId: string, year: number) {
    const goal = await prisma.readingGoal.findUnique({
      where: {
        userId_year: { userId, year },
      },
    });

    if (!goal) {
      return null;
    }

    const daysInYear = new Date(year, 11, 31).getDate() === 31 ? 366 : 365;
    const dayOfYear = Math.floor(
      (Date.now() - new Date(year, 0, 0).getTime()) / (1000 * 60 * 60 * 24),
    );
    const expectedProgress = Math.round((dayOfYear / daysInYear) * goal.targetBooks);

    return {
      targetBooks: goal.targetBooks,
      currentBooks: goal.currentBooks,
      expectedProgress,
      isOnTrack: goal.currentBooks >= expectedProgress,
      booksRemaining: Math.max(0, goal.targetBooks - goal.currentBooks),
      daysRemaining: daysInYear - dayOfYear,
    };
  }

  /**
   * Get personalized book recommendations
   */
  async getPersonalizedRecommendations(
    userId: string,
    options: {
      limit?: number;
      category?: string;
      excludeOwned?: boolean;
    } = {},
  ) {
    const { limit = 20, category, excludeOwned = true } = options;

    // Get user's reading preferences
    const preferences = await this.getUserPreferences(userId);

    // Get collaborative filtering recommendations
    const collaborativeRecs = await this.getCollaborativeRecommendations(userId, preferences);

    // Get content-based recommendations
    const contentRecs = await this.getContentBasedRecommendations(userId, preferences, category);

    // Combine and rank recommendations
    const allRecs = [...collaborativeRecs, ...contentRecs];
    const rankedRecs = this.rankRecommendations(allRecs, preferences);

    // Filter out owned books if requested
    if (excludeOwned) {
      const ownedBooks = await prisma.userBook.findMany({
        where: { userId },
        select: { bookId: true },
      });
      const ownedBookIds = new Set(ownedBooks.map((ub) => ub.bookId));

      return rankedRecs.filter((rec) => !ownedBookIds.has(rec.bookId)).slice(0, limit);
    }

    return rankedRecs.slice(0, limit);
  }

  /**
   * Get trending books based on user activity
   */
  async getTrendingRecommendations(
    options: {
      timeframe?: "week" | "month" | "year";
      category?: string;
      limit?: number;
    } = {},
  ) {
    const { timeframe = "month", category, limit = 20 } = options;

    let interval = "30 days";
    if (timeframe === "week") interval = "7 days";
    if (timeframe === "year") interval = "365 days";

    const trendingBooks = await prisma.$queryRaw<any[]>`
      SELECT 
        b.*,
        COUNT(ub.id)::int as activity_count,
        AVG(ub.rating)::float as avg_user_rating,
        COUNT(DISTINCT ub.user_id)::int as unique_readers
      FROM books b
      JOIN user_books ub ON b.id = ub.book_id
      WHERE ub.updated_at >= NOW() - INTERVAL '${interval}'
        AND ub.list_type IN ('READ_LIST', 'CURRENTLY_READING')
        ${category ? `AND '${category}' = ANY(b.categories)` : ""}
      GROUP BY b.id
      HAVING COUNT(ub.id) >= 3
      ORDER BY 
        (COUNT(ub.id) * 0.7 + COUNT(DISTINCT ub.user_id) * 0.3) DESC,
        avg_user_rating DESC
      LIMIT ${limit}
    `;

    return trendingBooks;
  }

  // Private helper methods
  private async getUserPreferences(userId: string) {
    const userBooks = await prisma.userBook.findMany({
      where: {
        userId,
        rating: { gte: 4 }, // Only highly rated books
        listType: "READ",
      },
      include: { book: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    const genres = new Map<string, number>();
    const authors = new Map<string, number>();
    const pageRanges = new Map<string, number>();

    userBooks.forEach((ub) => {
      const weight = (ub.rating || 3) / 5;

      ub.book.categories.forEach((cat) => {
        genres.set(cat, (genres.get(cat) || 0) + weight);
      });

      ub.book.authors.forEach((author) => {
        authors.set(author, (authors.get(author) || 0) + weight);
      });

      if (ub.book.pageCount) {
        const range = this.getPageRange(ub.book.pageCount);
        pageRanges.set(range, (pageRanges.get(range) || 0) + weight);
      }
    });

    return {
      favoriteGenres: Array.from(genres.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([genre]) => genre),
      favoriteAuthors: Array.from(authors.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([author]) => author),
      preferredPageRange:
        Array.from(pageRanges.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "medium",
      averageRating: userBooks.reduce((sum, ub) => sum + (ub.rating || 0), 0) / userBooks.length,
    };
  }

  private async getCollaborativeRecommendations(userId: string, _preferences: any) {
    // Find users with similar reading preferences
    const similarUsers = await prisma.$queryRaw<any[]>`
      WITH user_genres AS (
        SELECT 
          ub.user_id,
          unnest(b.categories) as genre,
          AVG(ub.rating) as avg_rating
        FROM user_books ub
        JOIN books b ON ub.book_id = b.id
        WHERE ub.rating >= 4
          AND array_length(b.categories, 1) > 0
        GROUP BY ub.user_id, unnest(b.categories)
      ),
      similarity_scores AS (
        SELECT 
          ug2.user_id,
          COUNT(*) as common_genres,
          AVG(ABS(ug1.avg_rating - ug2.avg_rating)) as rating_similarity
        FROM user_genres ug1
        JOIN user_genres ug2 ON ug1.genre = ug2.genre
        WHERE ug1.user_id = ${userId}
          AND ug2.user_id != ${userId}
        GROUP BY ug2.user_id
        HAVING COUNT(*) >= 3
      )
      SELECT 
        user_id,
        common_genres,
        rating_similarity,
        (common_genres::float / (1 + rating_similarity)) as similarity_score
      FROM similarity_scores
      ORDER BY similarity_score DESC
      LIMIT 10
    `;

    if (similarUsers.length === 0) return [];

    const similarUserIds = similarUsers.map((u) => u.user_id);

    // Get highly rated books from similar users
    const recommendations = await prisma.$queryRaw<any[]>`
      SELECT 
        b.*,
        AVG(ub.rating)::float as avg_rating,
        COUNT(ub.id)::int as recommendation_count
      FROM books b
      JOIN user_books ub ON b.id = ub.book_id
      WHERE ub.user_id = ANY(${similarUserIds})
        AND ub.rating >= 4
        AND ub.list_type = 'read_LIST'
        AND b.id NOT IN (
          SELECT book_id FROM user_books WHERE user_id = ${userId}
        )
      GROUP BY b.id
      ORDER BY avg_rating DESC, recommendation_count DESC
      LIMIT 50
    `;

    return recommendations.map((book) => ({
      ...book,
      recommendationType: "collaborative",
      score: book.avg_rating * 0.6 + (book.recommendation_count / similarUsers.length) * 0.4,
    }));
  }

  private async getContentBasedRecommendations(
    userId: string,
    preferences: any,
    category?: string,
  ) {
    const genreFilter = category
      ? `AND '${category}' = ANY(b.categories)`
      : preferences.favoriteGenres.length > 0
        ? `AND b.categories && ARRAY[${preferences.favoriteGenres.map((g: string) => `'${g}'`).join(",")}]`
        : "";

    const recommendations = await prisma.$queryRaw<any[]>`
      SELECT 
        b.*,
        CASE 
          WHEN b.categories && ARRAY[${preferences.favoriteGenres.map((g: string) => `'${g}'`).join(",")}] THEN 2
          ELSE 1
        END * 
        CASE 
          WHEN b.authors && ARRAY[${preferences.favoriteAuthors.map((a: string) => `'${a}'`).join(",")}] THEN 2
          ELSE 1
        END as content_score
      FROM books b
      WHERE b.id NOT IN (
        SELECT book_id FROM user_books WHERE user_id = ${userId}
      )
      ${genreFilter}
      AND b.average_rating >= 3.5
      ORDER BY 
        content_score DESC,
        b.average_rating DESC,
        b.ratings_count DESC
      LIMIT 50
    `;

    return recommendations.map((book) => ({
      ...book,
      recommendationType: "content",
      score: book.content_score * 0.4 + (book.average_rating || 0) * 0.6,
    }));
  }

  private rankRecommendations(recommendations: any[], preferences: any) {
    return recommendations
      .map((rec) => ({
        ...rec,
        finalScore: this.calculateFinalScore(rec, preferences),
      }))
      .sort((a, b) => b.finalScore - a.finalScore);
  }

  private calculateFinalScore(recommendation: any, preferences: any) {
    let score = recommendation.score || 0;

    // Boost score for preferred genres
    if (recommendation.categories) {
      const genreBonus =
        recommendation.categories.filter((cat: string) => preferences.favoriteGenres.includes(cat))
          .length * 0.2;
      score += genreBonus;
    }

    // Boost score for preferred authors
    if (recommendation.authors) {
      const authorBonus =
        recommendation.authors.filter((author: string) =>
          preferences.favoriteAuthors.includes(author),
        ).length * 0.3;
      score += authorBonus;
    }

    return score;
  }

  private getPageRange(pageCount: number): string {
    if (pageCount <= 200) return "short";
    if (pageCount <= 400) return "medium";
    if (pageCount <= 600) return "long";
    return "very_long";
  }
}

export const analyticsService = new AnalyticsService();
