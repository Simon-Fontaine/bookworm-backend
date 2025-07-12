import { requireAuth } from "../../middleware/auth.middleware";
import { libraryService } from "../../services/library.service";
import { ListType } from "../../types";
import { AddBookToLibrarySchema, UpdateUserBookSchema } from "../../validators";
import { FastifyInstance } from "fastify";
import { z } from "zod";

export default async function libraryRoutes(server: FastifyInstance) {
  // Get user's library
  server.get("/", {
    preHandler: requireAuth,
    schema: {
      querystring: z.object({
        listType: z.enum(ListType).optional(),
        isFavorite: z.boolean().optional(),
        search: z.string().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        sortBy: z.enum(["dateAdded", "title", "author", "rating"]).default("dateAdded"),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
      }),
    },
    handler: async (request, reply) => {
      const params = request.query as any;
      const result = await libraryService.getUserLibrary(request.user.id, params);

      return reply.send({
        success: true,
        data: result,
      });
    },
  });

  // Add book to library
  server.post("/books", {
    preHandler: requireAuth,
    schema: {
      body: AddBookToLibrarySchema,
    },
    handler: async (request, reply) => {
      const { googleId, listType } = request.body as z.infer<typeof AddBookToLibrarySchema>;
      const userBook = await libraryService.addBookToLibrary(request.user.id, googleId, listType);

      return reply.status(201).send({
        success: true,
        data: { userBook },
        message: "Book added to library",
      });
    },
  });

  // Update book in library
  server.patch("/books/:userBookId", {
    preHandler: requireAuth,
    schema: {
      body: UpdateUserBookSchema,
    },
    handler: async (request, reply) => {
      const { userBookId } = request.params as { userBookId: string };
      const updates = request.body as z.infer<typeof UpdateUserBookSchema>;

      // Convert date strings to Date objects if present
      const processedUpdates: any = { ...updates };
      if (updates.dateStarted) {
        processedUpdates.dateStarted = new Date(updates.dateStarted);
      }
      if (updates.dateFinished) {
        processedUpdates.dateFinished = new Date(updates.dateFinished);
      }

      const userBook = await libraryService.updateUserBook(
        userBookId,
        request.user.id,
        processedUpdates,
      );

      return reply.send({
        success: true,
        data: { userBook },
        message: "Book updated successfully",
      });
    },
  });

  // Remove book from library
  server.delete("/books/:userBookId", {
    preHandler: requireAuth,
    handler: async (request, reply) => {
      const { userBookId } = request.params as { userBookId: string };
      await libraryService.removeBookFromLibrary(userBookId, request.user.id);

      return reply.send({
        success: true,
        message: "Book removed from library",
      });
    },
  });

  // Get reading stats
  server.get("/stats", {
    preHandler: requireAuth,
    handler: async (request, reply) => {
      const stats = await libraryService.getUserStats(request.user.id);

      return reply.send({
        success: true,
        data: { stats },
      });
    },
  });

  // Batch update books
  server.post("/books/batch-update", {
    preHandler: requireAuth,
    schema: {
      body: z.object({
        bookIds: z.array(z.string()).min(1).max(50),
        updates: UpdateUserBookSchema,
      }),
    },
    handler: async (request, reply) => {
      const { bookIds, updates } = request.body as any;

      const results = await Promise.all(
        bookIds.map((id: string) =>
          libraryService
            .updateUserBook(id, request.user.id, updates)
            .then(() => ({ id, success: true }))
            .catch((error) => ({ id, success: false, error: error.message })),
        ),
      );

      return reply.send({
        success: true,
        data: { results },
      });
    },
  });
}
