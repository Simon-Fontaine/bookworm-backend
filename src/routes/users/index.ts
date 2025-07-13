import { optionalAuth, requireAuth } from "../../middleware/auth.middleware";
import { authService } from "../../services/auth.service";
import { socialService } from "../../services/social.service";
import { UpdateProfileSchema } from "../../validators";
import { FastifyInstance } from "fastify";
import { z } from "zod";

export default async function userRoutes(server: FastifyInstance) {
  // Get user profile by ID
  server.get("/:userId", {
    handler: async (request, reply) => {
      const { userId } = request.params as { userId: string };
      const user = await authService.getUserById(userId);

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: "User not found",
        });
      }

      return reply.send({
        success: true,
        data: { user },
      });
    },
  });

  // Get detailed user profile by username (public view)
  server.get("/:username/profile", {
    preHandler: optionalAuth,
    handler: async (request, reply) => {
      const { username } = request.params as { username: string };

      const profile = await authService.getUserProfileByUsername(username);
      if (!profile) {
        return reply.status(404).send({
          success: false,
          error: "User not found",
        });
      }

      // Check if current user follows this user
      let isFollowing = false;
      if (request.user) {
        const follow = await socialService.checkFollowStatus(request.user.id, profile.user.id);
        isFollowing = !!follow;
      }

      return reply.send({
        success: true,
        data: {
          ...profile,
          isFollowing,
        },
      });
    },
  });

  // Update profile
  server.patch("/profile", {
    preHandler: requireAuth,
    schema: {
      body: UpdateProfileSchema,
    },
    handler: async (request, reply) => {
      const updates = request.body as z.infer<typeof UpdateProfileSchema>;
      const user = await authService.updateProfile(request.user.id, updates);

      return reply.send({
        success: true,
        data: { user },
        message: "Profile updated successfully",
      });
    },
  });

  // Delete account
  server.delete("/account", {
    preHandler: requireAuth,
    schema: {
      body: z.object({
        password: z.string(),
        confirmation: z.literal("DELETE MY ACCOUNT"),
      }),
    },
    handler: async (request, reply) => {
      const { password } = request.body as any;
      await authService.deleteAccount(request.user.id, password);

      reply.clearCookie("token");

      return reply.send({
        success: true,
        message: "Account deleted successfully",
      });
    },
  });
}
