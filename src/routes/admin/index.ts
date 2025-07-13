import { prisma } from "../../db/client";
import { requireAuth } from "../../middleware/auth.middleware";
import { authService } from "../../services/auth.service";
import { boxService } from "../../services/box.service";
import { socialService } from "../../services/social.service";
import { Role } from "../../types";
import { AppError } from "../../utils/app-error";
import { FastifyInstance } from "fastify";
import { z } from "zod";

export default async function adminRoutes(server: FastifyInstance) {
  // Middleware to check admin role
  const requireAdmin = async (request: any, reply: any) => {
    await requireAuth(request, reply);

    const hasAdminRole = await authService.hasRole(request.user.id, Role.ADMIN);
    if (!hasAdminRole) {
      throw new AppError("Admin access required", 403, "INSUFFICIENT_PERMISSIONS");
    }
  };

  // Get system stats
  server.get("/stats", {
    preHandler: requireAdmin,
    handler: async (_request, reply) => {
      const [usersCount, booksCount, boxesCount, reviewsCount, recentUsers, systemHealth] =
        await Promise.all([
          prisma.user.count(),
          prisma.book.count(),
          prisma.bookBox.count({ where: { isActive: true } }),
          prisma.review.count(),
          prisma.user.findMany({
            take: 5,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              username: true,
              email: true,
              createdAt: true,
              isEmailVerified: true,
            },
          }),
          Promise.all([
            boxService.getServiceHealth(),
            socialService.getServiceHealth(),
            authService.cleanupExpiredTokens(),
          ]),
        ]);

      return reply.send({
        success: true,
        data: {
          stats: {
            usersCount,
            booksCount,
            boxesCount,
            reviewsCount,
          },
          recentUsers,
          systemHealth: {
            boxService: systemHealth[0],
            socialService: systemHealth[1],
            cleanup: systemHealth[2],
          },
        },
      });
    },
  });

  // Get all users with filters
  server.get("/users", {
    preHandler: requireAdmin,
    schema: {
      querystring: z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
        role: z.enum(Role).optional(),
        verified: z.boolean().optional(),
      }),
    },
    handler: async (request, reply) => {
      const { page, limit, search, role, verified } = request.query as any;

      const where: any = {};

      if (search) {
        where.OR = [
          { username: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { displayName: { contains: search, mode: "insensitive" } },
        ];
      }

      if (role) {
        where.roles = { has: role };
      }

      if (verified !== undefined) {
        where.isEmailVerified = verified;
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true,
            username: true,
            email: true,
            displayName: true,
            roles: true,
            isEmailVerified: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                books: true,
                reviews: true,
                followers: true,
                following: true,
              },
            },
          },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: "desc" },
        }),
        prisma.user.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: {
          users,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
      });
    },
  });

  // Update user roles
  server.patch("/users/:userId/roles", {
    preHandler: requireAdmin,
    schema: {
      body: z.object({
        action: z.enum(["add", "remove"]),
        role: z.enum(Role),
      }),
    },
    handler: async (request, reply) => {
      const { userId } = request.params as { userId: string };
      const { action, role } = request.body as any;

      const user =
        action === "add"
          ? await authService.addRole(userId, role)
          : await authService.removeRole(userId, role);

      return reply.send({
        success: true,
        data: { user },
        message: `Role ${action === "add" ? "added" : "removed"} successfully`,
      });
    },
  });

  // Delete user
  server.delete("/users/:userId", {
    preHandler: requireAdmin,
    handler: async (request, reply) => {
      const { userId } = request.params as { userId: string };

      // Prevent deleting other admins
      const targetUser = await authService.getUserById(userId);
      if (targetUser?.roles.includes(Role.ADMIN)) {
        throw new AppError("Cannot delete admin users", 403, "CANNOT_DELETE_ADMIN");
      }

      await prisma.user.delete({ where: { id: userId } });

      return reply.send({
        success: true,
        message: "User deleted successfully",
      });
    },
  });

  // Get system health
  server.get("/health", {
    preHandler: requireAdmin,
    handler: async (_request, reply) => {
      const services = await Promise.all([
        boxService.getServiceHealth(),
        socialService.getServiceHealth(),
      ]);

      return reply.send({
        success: true,
        data: {
          services: {
            database: services[0],
            social: services[1],
          },
          timestamp: new Date().toISOString(),
        },
      });
    },
  });

  // Cleanup expired tokens
  server.post("/cleanup", {
    preHandler: requireAdmin,
    handler: async (_request, reply) => {
      const result = await authService.cleanupExpiredTokens();

      return reply.send({
        success: true,
        data: result,
        message: "Cleanup completed successfully",
      });
    },
  });
}
