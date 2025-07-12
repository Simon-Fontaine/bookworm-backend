import "dotenv/config";
import { z } from "zod";

const configSchema = z.object({
  // server
  PORT: z.string().transform(Number).default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  FRONTEND_URL: z.url().default("http://localhost:8081"),

  // db
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),

  // mail
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string(),

  // third-party APIs
  GOOGLE_BOOKS_API_KEY: z.string().optional(),
  GOOGLE_PLACES_API_KEY: z.string().optional(),

  // analytics
  MAXMIND_ACCOUNT_ID: z.string().optional(),
  MAXMIND_LICENSE_KEY: z.string().optional(),

  // auth
  JWT_SECRET: z.string().min(32),
  BCRYPT_ROUNDS: z.string().transform(Number).default(12),
  SESSION_EXPIRY_DAYS: z.string().transform(Number).default(30),
  VERIFICATION_EXPIRY_HOURS: z.string().transform(Number).default(24),
  REGISTRATION_ENABLED: z
    .string()
    .transform((val) => val === "true")
    .default(true),
  REGISTRATION_INVITE_ONLY: z
    .string()
    .transform((val) => val === "true")
    .default(false),
});

export const config = configSchema.parse(process.env);
