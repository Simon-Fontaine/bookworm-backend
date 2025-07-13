import { ListType } from "../types";
import { z } from "zod";

// Validation messages
export const validationMessages = {
  required: (field: string) => `${field} is required`,
  length: {
    min: (field: string, length: number) => `${field} must be at least ${length} characters`,
    max: (field: string, length: number) => `${field} cannot exceed ${length} characters`,
  },
  format: {
    email: "Please enter a valid email address",
    username: "Username must be lowercase and contain only letters, numbers, and underscores",
    displayName: "Display name must contain only letters, numbers, underscores, and spaces",
    password:
      "Password must contain at least one uppercase letter, one lowercase letter, and one number",
  },
  password: {
    match: "Passwords do not match",
  },
};

// Common field validators
const usernameValidator = z
  .string()
  .min(3, validationMessages.length.min("Username", 3))
  .max(48, validationMessages.length.max("Username", 48))
  .regex(/^[a-z0-9_]+$/, validationMessages.format.username);

const emailValidator = z
  .string()
  .email(validationMessages.format.email)
  .min(1, validationMessages.required("Email"));

const passwordValidator = z
  .string()
  .min(8, validationMessages.length.min("Password", 8))
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, validationMessages.format.password);

const displayNameValidator = z
  .string()
  .min(1, validationMessages.required("Display name"))
  .max(48, validationMessages.length.max("Display name", 48))
  .regex(/^[a-zA-Z0-9_ ]+$/, validationMessages.format.displayName);

// Auth schemas
export const LoginSchema = z.object({
  email: emailValidator,
  password: z.string().min(1, validationMessages.required("Password")),
  rememberMe: z.boolean().optional(),
});

export const RegisterSchema = z.object({
  username: usernameValidator,
  displayName: displayNameValidator.optional(),
  fullName: z.string().min(1, validationMessages.required("Full name")).optional(),
  email: emailValidator,
  password: passwordValidator,
});

export const UpdateProfileSchema = z.object({
  username: usernameValidator.optional(),
  displayName: displayNameValidator.optional(),
  fullName: z.string().max(100, validationMessages.length.max("Full name", 100)).optional(),
  bio: z.string().max(500, validationMessages.length.max("Bio", 500)).optional(),
  location: z.string().max(100, validationMessages.length.max("Location", 100)).optional(),
});

// Library schemas
export const AddBookToLibrarySchema = z.object({
  googleId: z.string().min(1, validationMessages.required("Book ID")),
  listType: z.enum(ListType),
});

export const UpdateUserBookSchema = z.object({
  listType: z.enum(ListType).optional(),
  rating: z.number().min(1).max(5).optional(),
  notes: z.string().max(1000).optional(),
  review: z.string().max(2000).optional(),
  currentPage: z.number().min(0).optional(),
  progress: z.number().min(0).max(100).optional(),
  dateStarted: z.iso.datetime().optional(),
  dateFinished: z.iso.datetime().optional(),
  isFavorite: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

// Book box schemas
export const CreateBookBoxSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().min(1),
  accessHours: z.string().max(100).optional(),
  rules: z.string().max(500).optional(),
  contactInfo: z.string().max(200).optional(),
});

export const UpdateBookBoxSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  accessHours: z.string().max(100).optional(),
  rules: z.string().max(500).optional(),
  contactInfo: z.string().max(200).optional(),
});

// Social schemas
export const CreateReviewSchema = z.object({
  rating: z.number().min(1).max(5),
  content: z.string().max(2000).optional(),
  isPublic: z.boolean().default(true),
});

// Search schemas
export const SearchQuerySchema = z.object({
  q: z.string().min(1, "Search query is required"),
  type: z.enum(["all", "books", "users"]).default("all"),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(50).default(20),
});

export const BookSearchSchema = z.object({
  q: z.string().min(1, "Search query is required"),
  startIndex: z.number().min(0).default(0),
  maxResults: z.number().min(1).max(40).default(20),
  orderBy: z.enum(["relevance", "newest"]).default("relevance"),
  filter: z.string().optional(),
  langRestrict: z.string().optional(),
});

// Reading goal schemas
export const ReadingGoalSchema = z.object({
  targetBooks: z.number().min(1).max(1000).optional(),
  targetPages: z.number().min(1).max(100000).optional(),
});

// Pagination schema
export const PaginationSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// Generic ID schema
export const UUIDSchema = z.uuid("Invalid ID format");

// File upload schema
export const FileUploadSchema = z.object({
  filename: z.string(),
  mimetype: z.string().regex(/^image\/(jpeg|jpg|png|gif|webp)$/, "Invalid file type"),
  size: z.number().max(10 * 1024 * 1024, "File too large (max 10MB)"),
});

// Location schema
export const LocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radius: z.number().min(0.1).max(1000).default(10),
});

// Date range schema
export const DateRangeSchema = z.object({
  startDate: z.iso.datetime().optional(),
  endDate: z.iso.datetime().optional(),
});

// Bulk operation schema
export const BulkOperationSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
  action: z.string(),
  data: z.record(z.string(), z.any()).optional(),
});

// Helper function to validate and transform dates
export const validateDate = (dateString: string): Date | null => {
  try {
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
};

// Helper function to validate UUID
export const isValidUUID = (id: string): boolean => {
  return UUIDSchema.safeParse(id).success;
};

// Helper function to sanitize text input
export const sanitizeText = (text: string): string => {
  return text.trim().replace(/\s+/g, " ");
};

// Helper function to validate coordinates
export const validateCoordinates = (lat: number, lng: number): boolean => {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};
