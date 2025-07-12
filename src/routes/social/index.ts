import { requireAuth } from "../../middleware/auth.middleware";
import { socialService } from "../../services/social.service";
import { FastifyInstance } from "fastify";
import { z } from "zod";

export default async function socialRoutes(server: FastifyInstance) {
  // Follow user
  server.post("/follow/:userId", {
    preHandler: requireAuth,
    handler: async (request, reply) => {
      const { userId } = request.params as { userId: string };
      const follow = await socialService.followUser(request.user.id, userId);

      return reply.send({
        success: true,
        data: { follow },
        message: "User followed successfully",
      });
    },
  });

  // Unfollow user
  server.delete("/follow/:userId", {
    preHandler: requireAuth,
    handler: async (request, reply) => {
      const { userId } = request.params as { userId: string };
      await socialService.unfollowUser(request.user.id, userId);

      return reply.send({
        success: true,
        message: "User unfollowed successfully",
      });
    },
  });

  // Get followers
  server.get("/followers/:userId", {
    schema: {
      querystring: z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      }),
    },
    handler: async (request, reply) => {
      const { userId } = request.params as { userId: string };
      const { page, limit } = request.query as any;

      const result = await socialService.getFollowers(userId, { page, limit });

      return reply.send({
        success: true,
        data: result,
      });
    },
  });

  // Get following
  server.get("/following/:userId", {
    schema: {
      querystring: z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      }),
    },
    handler: async (request, reply) => {
      const { userId } = request.params as { userId: string };
      const { page, limit } = request.query as any;

      const result = await socialService.getFollowing(userId, { page, limit });

      return reply.send({
        success: true,
        data: result,
      });
    },
  });

  // Create/update review
  server.post("/reviews/:bookId", {
    preHandler: requireAuth,
    schema: {
      body: z.object({
        rating: z.number().min(1).max(5),
        content: z.string().max(2000).optional(),
        isPublic: z.boolean().default(true),
      }),
    },
    handler: async (request, reply) => {
      const { bookId } = request.params as { bookId: string };
      const data = request.body as any;

      const review = await socialService.createOrUpdateReview(request.user.id, bookId, data);

      return reply.send({
        success: true,
        data: { review },
        message: "Review saved successfully",
      });
    },
  });

  // Get activity feed
  server.get("/feed", {
    preHandler: requireAuth,
    schema: {
      querystring: z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      }),
    },
    handler: async (request, reply) => {
      const { page, limit } = request.query as any;
      const activities = await socialService.getActivityFeed(request.user.id, {
        page,
        limit,
      });

      return reply.send({
        success: true,
        data: { activities },
      });
    },
  });
}
