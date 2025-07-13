import { requireAuth } from "../../middleware/auth.middleware";
import { boxService } from "../../services/box.service";
import { BookCondition } from "../../types";
import { FastifyInstance } from "fastify";
import { z } from "zod";

export default async function boxRoutes(server: FastifyInstance) {
  // Create book box
  server.post("/", {
    preHandler: requireAuth,
    schema: {
      body: z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        address: z.string(),
        accessHours: z.string().optional(),
        rules: z.string().max(500).optional(),
        contactInfo: z.string().optional(),
      }),
    },
    handler: async (request, reply) => {
      const data = request.body as any;
      const box = await boxService.createBox(request.user.id, data);

      return reply.status(201).send({
        success: true,
        data: { box },
        message: "Book box created successfully",
      });
    },
  });

  // Find nearby boxes
  server.get("/nearby", {
    schema: {
      querystring: z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        radius: z.number().min(0.1).max(100).default(10),
      }),
    },
    handler: async (request, reply) => {
      const { latitude, longitude, radius } = request.query as any;
      const boxes = await boxService.findNearbyBoxes(latitude, longitude, radius);

      return reply.send({
        success: true,
        data: { boxes },
      });
    },
  });

  // Search book boxes
  server.get("/search", {
    schema: {
      querystring: z.object({
        q: z.string().min(1),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        radius: z.number().min(0.1).max(100).default(50),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20),
      }),
    },
    handler: async (request, reply) => {
      const { q, latitude, longitude, radius, page, limit } = request.query as any;

      const results = await boxService.searchBoxes(q, {
        latitude,
        longitude,
        radius,
        page,
        limit,
      });

      return reply.send({
        success: true,
        data: results,
      });
    },
  });

  // Get box details
  server.get("/:boxId", {
    handler: async (request, reply) => {
      const { boxId } = request.params as { boxId: string };
      const box = await boxService.getBoxDetails(boxId);

      return reply.send({
        success: true,
        data: { box },
      });
    },
  });

  // Add book to box
  server.post("/:boxId/books", {
    preHandler: requireAuth,
    schema: {
      body: z.object({
        googleId: z.string(),
        condition: z.nativeEnum(BookCondition).default(BookCondition.GOOD),
        notes: z.string().max(200).optional(),
      }),
    },
    handler: async (request, reply) => {
      const { boxId } = request.params as { boxId: string };
      const { googleId, condition, notes } = request.body as any;

      const boxBook = await boxService.addBookToBox(
        request.user.id,
        boxId,
        googleId,
        condition,
        notes,
      );

      return reply.status(201).send({
        success: true,
        data: { boxBook },
        message: "Book added to box",
      });
    },
  });

  // Take book from box
  server.post("/:boxId/books/:bookId/take", {
    preHandler: requireAuth,
    handler: async (request, reply) => {
      const { bookId } = request.params as { bookId: string };
      await boxService.takeBookFromBox(request.user.id, bookId);

      return reply.send({
        success: true,
        message: "Book taken from box",
      });
    },
  });

  // Update box
  server.patch("/:boxId", {
    preHandler: requireAuth,
    schema: {
      body: z.object({
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        accessHours: z.string().optional(),
        rules: z.string().max(500).optional(),
        contactInfo: z.string().optional(),
      }),
    },
    handler: async (request, reply) => {
      const { boxId } = request.params as { boxId: string };
      const updates = request.body as any;

      const box = await boxService.updateBox(request.user.id, boxId, updates);

      return reply.send({
        success: true,
        data: { box },
        message: "Box updated successfully",
      });
    },
  });

  // Delete box
  server.delete("/:boxId", {
    preHandler: requireAuth,
    handler: async (request, reply) => {
      const { boxId } = request.params as { boxId: string };
      await boxService.deleteBox(request.user.id, boxId);

      return reply.send({
        success: true,
        message: "Box deleted successfully",
      });
    },
  });
}
