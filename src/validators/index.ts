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

// Schemas
export const LoginSchema = z.object({
  email: z.email(validationMessages.format.email),
  password: z.string().min(1, validationMessages.length.min("Password", 1)),
  rememberMe: z.boolean().optional(),
});

export const RegisterSchema = z.object({
  username: z
    .string()
    .min(3, validationMessages.length.min("Username", 3))
    .max(48, validationMessages.length.max("Username", 48))
    .regex(/^[a-z0-9_]+$/, validationMessages.format.username),
  displayName: z
    .string()
    .min(3, validationMessages.length.min("Display name", 3))
    .max(48, validationMessages.length.max("Display name", 48))
    .regex(/^[a-zA-Z0-9_ ]+$/, validationMessages.format.displayName)
    .optional(),
  fullName: z.string().min(1, validationMessages.required("Full name")).optional(),
  email: z.email(validationMessages.format.email),
  password: z
    .string()
    .min(8, validationMessages.length.min("Password", 8))
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, validationMessages.format.password),
});

export const UpdateProfileSchema = z.object({
  username: z
    .string()
    .min(3, validationMessages.length.min("Username", 3))
    .max(48, validationMessages.length.max("Username", 48))
    .regex(/^[a-z0-9_]+$/, validationMessages.format.username)
    .optional(),
  displayName: z
    .string()
    .min(3, validationMessages.length.min("Display name", 3))
    .max(48, validationMessages.length.max("Display name", 48))
    .regex(/^[a-zA-Z0-9_ ]+$/, validationMessages.format.displayName)
    .optional(),
  fullName: z.string().max(100, validationMessages.length.max("Full name", 100)).optional(),
  bio: z.string().max(500, validationMessages.length.max("Bio", 500)).optional(),
  location: z.string().max(100, validationMessages.length.max("Location", 100)).optional(),
});

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
