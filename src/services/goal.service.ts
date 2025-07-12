import { prisma } from "../db/client";
import { ListType, ReadingGoal } from "../types";

export class GoalService {
  /**
   * Get or create reading goal for a year
   */
  async getOrCreateGoal(userId: string, year: number): Promise<ReadingGoal> {
    let goal = await prisma.readingGoal.findUnique({
      where: {
        userId_year: { userId, year },
      },
    });

    if (!goal) {
      goal = await prisma.readingGoal.create({
        data: {
          userId,
          year,
          targetBooks: 12, // Default goal
          currentBooks: 0,
        },
      });
    } else {
      // Update current books count
      const booksRead = await prisma.userBook.count({
        where: {
          userId,
          listType: ListType.READ,
          dateFinished: {
            gte: new Date(`${year}-01-01`),
            lt: new Date(`${year + 1}-01-01`),
          },
        },
      });

      if (goal.currentBooks !== booksRead) {
        goal = await prisma.readingGoal.update({
          where: { id: goal.id },
          data: { currentBooks: booksRead },
        });
      }
    }

    return goal;
  }

  /**
   * Update reading goal
   */
  async updateGoal(
    userId: string,
    year: number,
    updates: {
      targetBooks?: number;
      targetPages?: number;
    },
  ): Promise<ReadingGoal> {
    const goal = await this.getOrCreateGoal(userId, year);

    return prisma.readingGoal.update({
      where: { id: goal.id },
      data: updates,
    });
  }

  /**
   * Get reading progress
   */
  async getReadingProgress(
    userId: string,
    year: number,
  ): Promise<{
    goal: ReadingGoal;
    monthlyProgress: { month: number; booksRead: number; pagesRead: number }[];
    recentlyFinished: any[];
    projectedCompletion: Date | null;
  }> {
    const goal = await this.getOrCreateGoal(userId, year);

    // Get monthly progress
    const booksThisYear = await prisma.userBook.findMany({
      where: {
        userId,
        listType: ListType.READ,
        dateFinished: {
          gte: new Date(`${year}-01-01`),
          lt: new Date(`${year + 1}-01-01`),
        },
      },
      include: { book: true },
      orderBy: { dateFinished: "desc" },
    });

    // Calculate monthly progress
    const monthlyProgress = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      booksRead: 0,
      pagesRead: 0,
    }));

    booksThisYear.forEach((ub) => {
      if (ub.dateFinished) {
        const month = new Date(ub.dateFinished).getMonth();
        monthlyProgress[month].booksRead++;
        monthlyProgress[month].pagesRead += ub.book.pageCount || 0;
      }
    });

    // Get recently finished books
    const recentlyFinished = booksThisYear.slice(0, 5);

    // Calculate projected completion
    const currentMonth = new Date().getMonth() + 1;
    const averageBooksPerMonth = goal.currentBooks / currentMonth;
    const monthsNeeded = goal.targetBooks / averageBooksPerMonth;
    const projectedCompletion =
      averageBooksPerMonth > 0 && monthsNeeded <= 12
        ? new Date(year, Math.ceil(monthsNeeded) - 1)
        : null;

    return {
      goal,
      monthlyProgress,
      recentlyFinished,
      projectedCompletion,
    };
  }

  /**
   * Get reading achievements
   */
  async getAchievements(userId: string): Promise<{
    achievements: {
      id: string;
      name: string;
      description: string;
      icon: string;
      unlockedAt?: Date;
      progress: number;
      target: number;
    }[];
  }> {
    const stats = await prisma.userBook.findMany({
      where: { userId },
      include: { book: true },
    });

    const achievements = [
      {
        id: "first-book",
        name: "First Steps",
        description: "Read your first book",
        icon: "🎯",
        target: 1,
        progress: stats.filter((ub) => ub.listType === ListType.READ).length,
      },
      {
        id: "bookworm",
        name: "Bookworm",
        description: "Read 10 books",
        icon: "📚",
        target: 10,
        progress: stats.filter((ub) => ub.listType === ListType.READ).length,
      },
      {
        id: "page-turner",
        name: "Page Turner",
        description: "Read 1,000 pages",
        icon: "📖",
        target: 1000,
        progress: stats
          .filter((ub) => ub.listType === ListType.READ)
          .reduce((sum, ub) => sum + (ub.book.pageCount || 0), 0),
      },
      {
        id: "genre-explorer",
        name: "Genre Explorer",
        description: "Read books from 5 different genres",
        icon: "🗺️",
        target: 5,
        progress: new Set(stats.flatMap((ub) => ub.book.categories)).size,
      },
      {
        id: "review-master",
        name: "Review Master",
        description: "Write 10 book reviews",
        icon: "✍️",
        target: 10,
        progress: stats.filter((ub) => ub.review).length,
      },
    ];

    return {
      achievements: achievements.map((a) => ({
        ...a,
        unlockedAt: a.progress >= a.target ? new Date() : undefined,
      })),
    };
  }
}

export const goalService = new GoalService();
