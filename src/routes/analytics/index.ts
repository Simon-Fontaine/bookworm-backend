import { requireAuth } from "../../middleware/auth.middleware";
import { analyticsService } from "../../services/analytics.service";
import { FastifyInstance } from "fastify";
import { z } from "zod";

export default async function analyticsRoutes(server: FastifyInstance) {
  // Get reading insights
  server.get("/insights/:year?", {
    preHandler: requireAuth,
    schema: {
      params: z.object({
        year: z
          .string()
          .transform((val) => parseInt(val))
          .optional(),
      }),
    },
    handler: async (request, reply) => {
      const year = (request.params as any).year || new Date().getFullYear();
      const insights = await analyticsService.getReadingInsights(request.user.id, year);
      return reply.send({ success: true, data: insights });
    },
  });

  // Get personalized recommendations
  server.get("/recommendations", {
    preHandler: requireAuth,
    schema: {
      querystring: z.object({
        limit: z.string().transform(Number).pipe(z.number().min(1).max(50)).default(20),
        category: z.string().optional(),
        excludeOwned: z.boolean().default(true),
      }),
    },
    handler: async (request, reply) => {
      const recommendations = await analyticsService.getPersonalizedRecommendations(
        request.user.id,
        request.query as any,
      );
      return reply.send({ success: true, data: recommendations });
    },
  });

  // Get trending recommendations
  server.get("/trending", {
    schema: {
      querystring: z.object({
        timeframe: z.enum(["week", "month", "year"]).default("month"),
        category: z.string().optional(),
        limit: z.string().transform(Number).pipe(z.number().min(1).max(50)).default(20),
      }),
    },
    handler: async (request, reply) => {
      const recommendations = await analyticsService.getTrendingRecommendations(
        request.query as any,
      );
      return reply.send({ success: true, data: recommendations });
    },
  });
}
