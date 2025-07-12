import { bookService } from "../../services/book.service";
import { socialService } from "../../services/social.service";
import { FastifyInstance } from "fastify";
import { z } from "zod";

export default async function searchRoutes(server: FastifyInstance) {
  // Global search
  server.get("/", {
    schema: {
      querystring: z.object({
        q: z.string().min(1),
        type: z.enum(["all", "books", "users"]).default("all"),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20),
      }),
    },
    handler: async (request, reply) => {
      const { q, type, page, limit } = request.query as any;
      const results: any = {};

      if (type === "all" || type === "books") {
        results.books = await bookService.searchBooks(q, {
          maxResults: limit,
          startIndex: (page - 1) * limit,
        });
      }

      if (type === "all" || type === "users") {
        results.users = await socialService.searchUsers(q, { page, limit });
      }

      return reply.send({
        success: true,
        data: results,
      });
    },
  });
}
