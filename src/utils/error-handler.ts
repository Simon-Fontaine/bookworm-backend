import { AppError } from "./app-error";
import { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export async function errorHandler(error: Error, request: FastifyRequest, reply: FastifyReply) {
  // Log error with request context
  request.log.error({
    error: error.message,
    stack: error.stack,
    url: request.url,
    method: request.method,
    userId: (request as any).user?.id,
    userAgent: request.headers["user-agent"],
    ip: request.ip,
  });

  // Handle validation errors
  if (error instanceof ZodError) {
    return reply.status(400).send({
      success: false,
      error: "Validation failed",
      details: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
      code: "VALIDATION_ERROR",
    });
  }

  // Handle app errors
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      success: false,
      error: error.message,
      code: error.code,
    });
  }

  // Handle Prisma errors
  if (error.name === "PrismaClientKnownRequestError") {
    const prismaError = error as any;

    // Unique constraint violation
    if (prismaError.code === "P2002") {
      const field = prismaError.meta?.target?.[0] || "field";
      return reply.status(400).send({
        success: false,
        error: `${field} already exists`,
        code: "DUPLICATE_RESOURCE",
      });
    }

    // Foreign key constraint violation
    if (prismaError.code === "P2003") {
      return reply.status(400).send({
        success: false,
        error: "Invalid reference",
        code: "INVALID_REFERENCE",
      });
    }

    // Record not found
    if (prismaError.code === "P2025") {
      return reply.status(404).send({
        success: false,
        error: "Resource not found",
        code: "RESOURCE_NOT_FOUND",
      });
    }

    return reply.status(400).send({
      success: false,
      error: "Database error",
      code: "DATABASE_ERROR",
    });
  }

  // Handle JWT errors
  if (error.name === "JsonWebTokenError") {
    return reply.status(401).send({
      success: false,
      error: "Invalid token",
      code: "INVALID_TOKEN",
    });
  }

  if (error.name === "TokenExpiredError") {
    return reply.status(401).send({
      success: false,
      error: "Token expired",
      code: "TOKEN_EXPIRED",
    });
  }

  // Handle file upload errors
  if (error.message?.includes("File too large")) {
    return reply.status(413).send({
      success: false,
      error: "File too large",
      code: "FILE_TOO_LARGE",
    });
  }

  // Handle rate limit errors
  if (error.message?.includes("Rate limit")) {
    return reply.status(429).send({
      success: false,
      error: "Too many requests",
      code: "RATE_LIMIT_EXCEEDED",
    });
  }

  // Handle Redis errors
  if (error.message?.includes("Redis")) {
    request.log.error("Redis error:", error);
    // Continue without cache for non-critical operations
  }

  // Default error
  const isDevelopment = process.env.NODE_ENV === "development";

  return reply.status(500).send({
    success: false,
    error: isDevelopment ? error.message : "Internal server error",
    code: "INTERNAL_ERROR",
    ...(isDevelopment && { stack: error.stack }),
  });
}
