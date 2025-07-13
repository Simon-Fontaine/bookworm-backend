import { requireAuth } from "../../middleware/auth.middleware";
import { authService } from "../../services/auth.service";
import { getClientInfo } from "../../utils/client-info";
import { LoginSchema, RegisterSchema } from "../../validators";
import { FastifyInstance } from "fastify";
import { z } from "zod";

export default async function authRoutes(server: FastifyInstance) {
  // Register
  server.post("/register", {
    schema: {
      body: RegisterSchema,
    },
    handler: async (request, reply) => {
      const data = request.body as z.infer<typeof RegisterSchema>;
      const user = await authService.register(data);

      return reply.send({
        success: true,
        data: { user },
        message: "Registration successful. Please check your email to verify your account.",
      });
    },
  });

  // Login
  server.post("/login", {
    schema: {
      body: LoginSchema,
    },
    handler: async (request, reply) => {
      const { email, password } = request.body as z.infer<typeof LoginSchema>;
      const clientInfo = getClientInfo(request);

      const result = await authService.login(email, password, {
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
        device: clientInfo.device,
      });

      // Set session cookie
      reply.setCookie("token", result.session.token, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        expires: result.session.expiresAt,
      });

      return reply.send({
        success: true,
        data: {
          user: result.user,
          session: {
            expiresAt: result.session.expiresAt,
          },
          locationInfo: result.locationInfo,
        },
      });
    },
  });

  // Logout
  server.post("/logout", {
    preHandler: requireAuth,
    handler: async (request, reply) => {
      const token = request.cookies.token || "";
      await authService.logout(token);

      reply.clearCookie("token");

      return reply.send({
        success: true,
        message: "Logged out successfully",
      });
    },
  });

  // Logout all sessions
  server.post("/logout-all", {
    preHandler: requireAuth,
    handler: async (request, reply) => {
      await authService.logoutAllSessions(request.user.id, request.session?.id);

      reply.clearCookie("token");

      return reply.send({
        success: true,
        message: "Logged out from all devices",
      });
    },
  });

  // Get current user
  server.get("/me", {
    preHandler: requireAuth,
    handler: async (request, reply) => {
      const needsOnboarding = await authService.needsOnboarding(request.user.id);

      return reply.send({
        success: true,
        data: {
          user: request.user,
          needsOnboarding,
        },
      });
    },
  });

  // Complete onboarding (profile setup)
  server.post("/complete-onboarding", {
    preHandler: requireAuth,
    schema: {
      body: z.object({
        username: z
          .string()
          .min(3)
          .max(48)
          .regex(/^[a-z0-9_]+$/),
        displayName: z.string().min(1).max(48).optional(),
        fullName: z.string().min(1).max(100).optional(),
        bio: z.string().max(500).optional(),
        location: z.string().max(100).optional(),
      }),
    },
    handler: async (request, reply) => {
      const data = request.body as any;

      // Check if username is available
      const existingUser = await authService.getUserByUsername(data.username);
      if (existingUser && existingUser.id !== request.user.id) {
        return reply.status(400).send({
          success: false,
          error: "Username already taken",
          code: "USERNAME_EXISTS",
        });
      }

      const user = await authService.updateProfile(request.user.id, data);

      return reply.send({
        success: true,
        data: { user },
        message: "Profile setup completed",
      });
    },
  });

  // Get sessions
  server.get("/sessions", {
    preHandler: requireAuth,
    handler: async (request, reply) => {
      const sessions = await authService.getUserSessions(request.user.id, request.session?.id);

      return reply.send({
        success: true,
        data: { sessions },
      });
    },
  });

  // Revoke session
  server.delete("/sessions/:sessionId", {
    preHandler: requireAuth,
    handler: async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };
      await authService.revokeSession(sessionId, request.user.id);

      return reply.send({
        success: true,
        message: "Session revoked successfully",
      });
    },
  });

  // Verify email
  server.post("/verify-email", {
    schema: {
      body: z.object({
        token: z.string().uuid(),
      }),
    },
    handler: async (request, reply) => {
      const { token } = request.body as { token: string };
      const user = await authService.verifyEmail(token);

      return reply.send({
        success: true,
        data: { user },
        message: "Email verified successfully",
      });
    },
  });

  // Resend verification email
  server.post("/resend-verification", {
    preHandler: requireAuth,
    handler: async (request, reply) => {
      if (request.user.isEmailVerified) {
        return reply.status(400).send({
          success: false,
          error: "Email already verified",
        });
      }

      await authService.createEmailVerification(request.user.id);

      return reply.send({
        success: true,
        message: "Verification email sent",
      });
    },
  });

  // Request password reset
  server.post("/forgot-password", {
    schema: {
      body: z.object({
        email: z.email(),
      }),
    },
    handler: async (request, reply) => {
      const { email } = request.body as { email: string };
      await authService.requestPasswordReset(email);

      return reply.send({
        success: true,
        message: "Password reset instructions sent to your email",
      });
    },
  });

  // Reset password
  server.post("/reset-password", {
    schema: {
      body: z.object({
        token: z.string().uuid(),
        password: z.string().min(8),
      }),
    },
    handler: async (request, reply) => {
      const { token, password } = request.body as { token: string; password: string };
      const user = await authService.resetPassword(token, password);

      return reply.send({
        success: true,
        data: { user },
        message: "Password reset successfully",
      });
    },
  });

  // Change password
  server.post("/change-password", {
    preHandler: requireAuth,
    schema: {
      body: z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(8),
        logoutOtherDevices: z.boolean().default(false),
      }),
    },
    handler: async (request, reply) => {
      const { currentPassword, newPassword, logoutOtherDevices } = request.body as any;

      await authService.changePassword(
        request.user.id,
        currentPassword,
        newPassword,
        !logoutOtherDevices,
        request.session?.id,
      );

      return reply.send({
        success: true,
        message: "Password changed successfully",
      });
    },
  });
}
