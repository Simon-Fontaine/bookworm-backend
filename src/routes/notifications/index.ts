import { requireAuth } from "../../middleware/auth.middleware";
import { notificationService } from "../../services/notification.service";
import { FastifyInstance } from "fastify";
import { z } from "zod";

export default async function notificationRoutes(server: FastifyInstance) {
  // Get user notifications
  server.get("/", {
    preHandler: requireAuth,
    schema: {
      querystring: z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20),
        unreadOnly: z.boolean().default(false),
      }),
    },
    handler: async (request, reply) => {
      const result = await notificationService.getUserNotifications(
        request.user.id,
        request.query as any,
      );
      return reply.send({ success: true, data: result });
    },
  });

  // Mark notifications as read
  server.post("/mark-read", {
    preHandler: requireAuth,
    schema: {
      body: z.object({
        notificationIds: z.array(z.string().uuid()),
      }),
    },
    handler: async (request, reply) => {
      const body = request.body as { notificationIds: string[] };
      await notificationService.markAsRead(body.notificationIds, request.user.id);
      return reply.send({ success: true });
    },
  });

  // Register push token
  server.post("/push-token", {
    preHandler: requireAuth,
    schema: {
      body: z.object({
        token: z.string(),
        platform: z.enum(["ios", "android", "web"]),
      }),
    },
    handler: async (request, reply) => {
      const body = request.body as { token: string; platform: "ios" | "android" | "web" };
      await notificationService.registerPushToken(request.user.id, body.token, body.platform);
      return reply.send({ success: true });
    },
  });

  // Get notification settings
  server.get("/settings", {
    preHandler: requireAuth,
    handler: async (request, reply) => {
      const settings = await notificationService.getUserNotificationSettings(request.user.id);
      return reply.send({ success: true, data: settings });
    },
  });

  // Update notification settings
  server.patch("/settings", {
    preHandler: requireAuth,
    schema: {
      body: z.object({
        emailNotifications: z.boolean().optional(),
        pushNotifications: z.boolean().optional(),
        readingReminders: z.boolean().optional(),
        goalReminders: z.boolean().optional(),
        socialNotifications: z.boolean().optional(),
        bookClubNotifications: z.boolean().optional(),
        weeklyDigest: z.boolean().optional(),
      }),
    },
    handler: async (request, reply) => {
      const settings = await notificationService.updateNotificationSettings(
        request.user.id,
        request.body,
      );
      return reply.send({ success: true, data: settings });
    },
  });
}
