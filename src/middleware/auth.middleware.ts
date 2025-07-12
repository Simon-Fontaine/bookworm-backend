import { authService } from "../services/auth.service";
import { Session, User } from "../types";
import { AppError } from "../utils/app-error";
import { FastifyReply, FastifyRequest } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    user: Omit<User, "password">;
    session?: Session;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: Omit<User, "password">;
  }
}

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
  try {
    const token = request.cookies.token || request.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
    }

    const result = await authService.validateSession(token);
    if (!result) {
      throw new AppError("Invalid or expired session", 401, "INVALID_SESSION");
    }

    request.user = result.user;
    request.session = result.session;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("Authentication failed", 401, "AUTH_FAILED");
  }
}

export async function optionalAuth(request: FastifyRequest, _reply: FastifyReply) {
  try {
    const token = request.cookies.token || request.headers.authorization?.replace("Bearer ", "");

    if (token) {
      const result = await authService.validateSession(token);
      if (result) {
        request.user = result.user;
        request.session = result.session;
      }
    }
  } catch (error) {
    // Ignore auth errors for optional auth
  }
}
