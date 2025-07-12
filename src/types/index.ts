import {
  BookCondition,
  ListType,
  Book as PrismaBook,
  BookBox as PrismaBookBox,
  BoxActivity as PrismaBoxActivity,
  BoxBook as PrismaBoxBook,
  Follow as PrismaFollow,
  ReadingGoal as PrismaReadingGoal,
  Review as PrismaReview,
  Session as PrismaSession,
  User as PrismaUser,
  UserBook as PrismaUserBook,
  Verification as PrismaVerification,
  Role,
  VerificationType,
} from "@prisma/client";

export { Role, ListType, BookCondition, VerificationType };

export type User = PrismaUser;
export type Session = PrismaSession;
export type Verification = PrismaVerification;
export type Book = PrismaBook;
export type UserBook = PrismaUserBook;
export type ReadingGoal = PrismaReadingGoal;
export type BookBox = PrismaBookBox;
export type BoxBook = PrismaBoxBook;
export type BoxActivity = PrismaBoxActivity;
export type Review = PrismaReview;
export type Follow = PrismaFollow;

// Custom types
export interface UserBookWithBook extends UserBook {
  book: Book;
}

export interface BookSearchResult {
  id: string;
  title: string;
  authors: string[];
  description?: string;
  thumbnailUrl?: string;
  publishedDate?: string;
  pageCount?: number;
  categories: string[];
  averageRating?: number;
  ratingsCount?: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface AuthTokens {
  sessionToken: string;
  csrfToken?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  fullName?: string;
  displayName?: string;
}
