import { AppError } from "./app-error";
import { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export async function errorHandler(error: Error, request: FastifyRequest, reply: FastifyReply) {
  // Log error
  request.log.error(error);

  // Handle validation errors
  if (error instanceof ZodError) {
    return reply.status(400).send({
      success: false,
      error: "Validation failed",
      details: error.issues,
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
    return reply.status(400).send({
      success: false,
      error: "Database error",
      code: "DATABASE_ERROR",
    });
  }

  // Default error
  return reply.status(500).send({
    success: false,
    error: "Internal server error",
    code: "INTERNAL_ERROR",
  });
}
