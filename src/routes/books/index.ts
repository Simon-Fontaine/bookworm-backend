import { optionalAuth, requireAuth } from "../../middleware/auth.middleware";
import { bookService } from "../../services/book.service";
import { FastifyInstance } from "fastify";
import { z } from "zod";

export default async function bookRoutes(server: FastifyInstance) {
  // Search books
  server.get("/search", {
    schema: {
      querystring: z.object({
        q: z.string().min(1),
        startIndex: z.string().transform(Number).pipe(z.number().min(0)).default(0),
        maxResults: z.string().transform(Number).pipe(z.number().min(1).max(40)).default(20),
        orderBy: z.enum(["relevance", "newest"]).default("relevance"),
        filter: z.string().optional(),
        langRestrict: z.string().optional(),
      }),
    },
    handler: async (request, reply) => {
      const params = request.query as any;
      const books = await bookService.searchBooks(params.q, params);

      return reply.send({
        success: true,
        data: { books },
      });
    },
  });

  // Get book details
  server.get("/:googleId", {
    preHandler: optionalAuth,
    handler: async (request, reply) => {
      const { googleId } = request.params as { googleId: string };
      const book = await bookService.getBookByGoogleId(googleId);

      if (!book) {
        return reply.status(404).send({
          success: false,
          error: "Book not found",
        });
      }

      return reply.send({
        success: true,
        data: { book },
      });
    },
  });

  // Get trending books
  server.get("/trending", {
    schema: {
      querystring: z.object({
        category: z.string().optional(),
        limit: z.string().transform(Number).pipe(z.number().min(1).max(50)).default(20),
      }),
    },
    handler: async (request, reply) => {
      const { category, limit } = request.query as any;
      const books = await bookService.getTrendingBooks(category, limit);

      return reply.send({
        success: true,
        data: { books },
      });
    },
  });

  // Get new releases
  server.get("/new-releases", {
    schema: {
      querystring: z.object({
        category: z.string().optional(),
        limit: z.string().transform(Number).pipe(z.number().min(1).max(50)).default(20),
      }),
    },
    handler: async (request, reply) => {
      const { category, limit } = request.query as any;
      const books = await bookService.getNewReleases(category, limit);

      return reply.send({
        success: true,
        data: { books },
      });
    },
  });

  // Get personalized recommendations
  server.get("/recommendations", {
    preHandler: requireAuth,
    schema: {
      querystring: z.object({
        limit: z.string().transform(Number).pipe(z.number().min(1).max(50)).default(20),
      }),
    },
    handler: async (request, reply) => {
      const { limit } = request.query as any;
      const books = await bookService.getRecommendations(request.user.id, limit);

      return reply.send({
        success: true,
        data: { books },
      });
    },
  });

  // Scan book by ISBN
  server.post("/scan", {
    preHandler: requireAuth,
    schema: {
      body: z.object({
        isbn: z.string().min(10).max(13),
      }),
    },
    handler: async (request, reply) => {
      const { isbn } = request.body as { isbn: string };
      const book = await bookService.scanBookByISBN(isbn);

      if (!book) {
        return reply.status(404).send({
          success: false,
          error: "Book not found with this ISBN",
        });
      }

      return reply.send({
        success: true,
        data: { book },
      });
    },
  });
}
