// Import all route modules
import authRoutes from "./auth";
import bookRoutes from "./books";
import boxRoutes from "./boxes";
import goalRoutes from "./goals";
import libraryRoutes from "./library";
import searchRoutes from "./search";
import socialRoutes from "./social";
import userRoutes from "./users";
import { FastifyInstance } from "fastify";

export async function registerRoutes(server: FastifyInstance) {
  // API v1 routes
  await server.register(authRoutes, { prefix: "/api/v1/auth" });
  await server.register(userRoutes, { prefix: "/api/v1/users" });
  await server.register(bookRoutes, { prefix: "/api/v1/books" });
  await server.register(libraryRoutes, { prefix: "/api/v1/library" });
  await server.register(goalRoutes, { prefix: "/api/v1/goals" });
  await server.register(boxRoutes, { prefix: "/api/v1/boxes" });
  await server.register(socialRoutes, { prefix: "/api/v1/social" });
  await server.register(searchRoutes, { prefix: "/api/v1/search" });
}
