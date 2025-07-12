import { requireAuth } from "../../middleware/auth.middleware";
import { authService } from "../../services/auth.service";
import { UpdateProfileSchema } from "../../validators";
import { FastifyInstance } from "fastify";
import { z } from "zod";

export default async function userRoutes(server: FastifyInstance) {
  // Get user profile
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
