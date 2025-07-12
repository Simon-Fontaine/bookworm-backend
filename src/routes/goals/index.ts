import { requireAuth } from "../../middleware/auth.middleware";
import { goalService } from "../../services/goal.service";
import { FastifyInstance } from "fastify";
import { z } from "zod";

export default async function goalRoutes(server: FastifyInstance) {
  // Get reading goal for a year
  server.get("/:year", {
    preHandler: requireAuth,
    schema: {
      params: z.object({
        year: z.string().transform((val) => parseInt(val)),
      }),
    },
    handler: async (request, reply) => {
      const { year } = request.params as { year: number };
      const goal = await goalService.getOrCreateGoal(request.user.id, year);

      return reply.send({
        success: true,
        data: { goal },
      });
    },
  });

  // Update reading goal
  server.patch("/:year", {
    preHandler: requireAuth,
    schema: {
      params: z.object({
        year: z.string().transform((val) => parseInt(val)),
      }),
      body: z.object({
        targetBooks: z.number().min(1).max(1000).optional(),
        targetPages: z.number().min(1).max(100000).optional(),
      }),
    },
    handler: async (request, reply) => {
      const { year } = request.params as { year: number };
      const updates = request.body as any;

      const goal = await goalService.updateGoal(request.user.id, year, updates);

      return reply.send({
        success: true,
        data: { goal },
        message: "Reading goal updated",
      });
    },
  });

  // Get reading progress
  server.get("/:year/progress", {
    preHandler: requireAuth,
    schema: {
      params: z.object({
        year: z.string().transform((val) => parseInt(val)),
      }),
    },
    handler: async (request, reply) => {
      const { year } = request.params as { year: number };
      const progress = await goalService.getReadingProgress(request.user.id, year);

      return reply.send({
        success: true,
        data: progress,
      });
    },
  });

  // Get achievements
  server.get("/achievements", {
    preHandler: requireAuth,
    handler: async (request, reply) => {
      const achievements = await goalService.getAchievements(request.user.id);

      return reply.send({
        success: true,
        data: achievements,
      });
    },
  });
}
