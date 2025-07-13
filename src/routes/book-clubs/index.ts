import { optionalAuth, requireAuth } from "../../middleware/auth.middleware";
import { bookClubService } from "../../services/book-club.service";
import { FastifyInstance } from "fastify";
import { z } from "zod";

export default async function bookClubRoutes(server: FastifyInstance) {
  // Create book club
  server.post("/", {
    preHandler: requireAuth,
    schema: {
      body: z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        isPrivate: z.boolean().default(false),
        memberLimit: z.number().min(2).max(1000).optional(),
        rules: z.string().max(1000).optional(),
      }),
    },
    handler: async (request, reply) => {
      const club = await bookClubService.createBookClub(request.user.id, request.body as any);
      return reply.status(201).send({ success: true, data: club });
    },
  });

  // Search book clubs
  server.get("/search", {
    schema: {
      querystring: z.object({
        q: z.string().min(1),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20),
        isPrivate: z.boolean().optional(),
      }),
    },
    handler: async (request, reply) => {
      const query = request.query as {
        q: string;
        page?: number;
        limit?: number;
        isPrivate?: boolean;
      };
      const result = await bookClubService.searchBookClubs(query.q, query);
      return reply.send({ success: true, data: result });
    },
  });

  // Get user's book clubs
  server.get("/my-clubs", {
    preHandler: requireAuth,
    handler: async (request, reply) => {
      const clubs = await bookClubService.getUserBookClubs(request.user.id);
      return reply.send({ success: true, data: clubs });
    },
  });

  // Join book club
  server.post("/:clubId/join", {
    preHandler: requireAuth,
    schema: {
      body: z.object({
        inviteCode: z.string().optional(),
      }),
    },
    handler: async (request, reply) => {
      const { clubId } = request.params as { clubId: string };
      const body = request.body as { inviteCode?: string };
      const member = await bookClubService.joinBookClub(request.user.id, clubId, body.inviteCode);
      return reply.send({ success: true, data: member });
    },
  });

  // Leave book club
  server.post("/:clubId/leave", {
    preHandler: requireAuth,
    handler: async (request, reply) => {
      const { clubId } = request.params as { clubId: string };
      await bookClubService.leaveBookClub(request.user.id, clubId);
      return reply.send({ success: true });
    },
  });

  // Get book club details
  server.get("/:clubId", {
    preHandler: optionalAuth,
    handler: async (request, reply) => {
      const { clubId } = request.params as { clubId: string };
      const club = await bookClubService.getBookClubDetails(clubId, request.user?.id);
      return reply.send({ success: true, data: club });
    },
  });

  // Start new reading
  server.post("/:clubId/readings", {
    preHandler: requireAuth,
    schema: {
      body: z.object({
        bookId: z.string().uuid(),
        startDate: z.string().datetime(),
        endDate: z.string().datetime(),
        description: z.string().max(500).optional(),
      }),
    },
    handler: async (request, reply) => {
      const { clubId } = request.params as { clubId: string };
      const body = request.body as {
        bookId: string;
        startDate: string;
        endDate: string;
        description?: string;
      };
      const reading = await bookClubService.startReading(request.user.id, clubId, {
        ...body,
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
      });
      return reply.status(201).send({ success: true, data: reading });
    },
  });

  // Update reading progress
  server.patch("/readings/:readingId/progress", {
    preHandler: requireAuth,
    schema: {
      body: z.object({
        currentPage: z.number().min(0).optional(),
        progress: z.number().min(0).max(100).optional(),
        isFinished: z.boolean().optional(),
        notes: z.string().max(500).optional(),
      }),
    },
    handler: async (request, reply) => {
      const { readingId } = request.params as { readingId: string };
      const progress = await bookClubService.updateReadingProgress(
        request.user.id,
        readingId,
        request.body as {
          currentPage?: number;
          progress?: number;
          isFinished?: boolean;
          notes?: string;
        },
      );
      return reply.send({ success: true, data: progress });
    },
  });

  // Get club discussions
  server.get("/:clubId/discussions", {
    preHandler: requireAuth,
    schema: {
      querystring: z.object({
        readingId: z.string().uuid().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20),
        type: z
          .enum([
            "GENERAL",
            "BOOK_DISCUSSION",
            "SPOILER_FREE",
            "SPOILER_DISCUSSION",
            "POLL",
            "ANNOUNCEMENT",
          ])
          .optional(),
      }),
    },
    handler: async (request, reply) => {
      const { clubId } = request.params as { clubId: string };
      const result = await bookClubService.getClubDiscussions(
        clubId,
        request.user.id,
        request.query as any,
      );
      return reply.send({ success: true, data: result });
    },
  });

  // Create discussion
  server.post("/:clubId/discussions", {
    preHandler: requireAuth,
    schema: {
      body: z.object({
        title: z.string().min(1).max(200),
        content: z.string().min(1).max(5000),
        readingId: z.string().uuid().optional(),
        discussionType: z
          .enum([
            "GENERAL",
            "BOOK_DISCUSSION",
            "SPOILER_FREE",
            "SPOILER_DISCUSSION",
            "POLL",
            "ANNOUNCEMENT",
          ])
          .optional(),
      }),
    },
    handler: async (request, reply) => {
      const { clubId } = request.params as { clubId: string };
      const discussion = await bookClubService.createDiscussion(
        request.user.id,
        clubId,
        request.body as {
          title: string;
          content: string;
          readingId?: string;
          discussionType?: any;
        },
      );
      return reply.status(201).send({ success: true, data: discussion });
    },
  });

  // Get discussion with replies
  server.get("/discussions/:discussionId", {
    preHandler: requireAuth,
    handler: async (request, reply) => {
      const { discussionId } = request.params as { discussionId: string };
      const discussion = await bookClubService.getDiscussionWithReplies(
        discussionId,
        request.user.id,
      );
      return reply.send({ success: true, data: discussion });
    },
  });

  // Reply to discussion
  server.post("/discussions/:discussionId/replies", {
    preHandler: requireAuth,
    schema: {
      body: z.object({
        content: z.string().min(1).max(2000),
        parentId: z.string().uuid().optional(),
      }),
    },
    handler: async (request, reply) => {
      const { discussionId } = request.params as { discussionId: string };
      const reply_data = await bookClubService.replyToDiscussion(
        request.user.id,
        discussionId,
        request.body as { content: string; parentId?: string },
      );
      return reply.status(201).send({ success: true, data: reply_data });
    },
  });
}
