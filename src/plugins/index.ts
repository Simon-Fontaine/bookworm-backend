import { config } from "../config";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyJwt from "@fastify/jwt";
import fastifyMultipart from "@fastify/multipart";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyRedis from "@fastify/redis";
import { FastifyInstance, FastifySchemaCompiler } from "fastify";
import { ZodError, ZodType } from "zod";

const zodValidatorCompiler: FastifySchemaCompiler<ZodType> = ({ schema }) => {
  return (data: unknown) => {
    const result = (schema as ZodType).safeParse(data);
    if (result.success) {
      return { value: result.data };
    }
    const error = result.error as ZodError & { statusCode?: number };
    error.statusCode = 400;
    return { error };
  };
};

export async function registerPlugins(server: FastifyInstance) {
  // Security
  await server.register(fastifyHelmet, {
    contentSecurityPolicy: false, // Disable for development
  });

  // CORS
  await server.register(fastifyCors, {
    origin: [config.FRONTEND_URL, "http://localhost:19006"], // Expo web
    credentials: true,
  });

  // Redis
  await server.register(fastifyRedis, {
    url: config.REDIS_URL,
  });

  // Rate limiting
  await server.register(fastifyRateLimit, {
    max: 100,
    timeWindow: "1 minute",
    redis: server.redis,
  });

  // JWT
  await server.register(fastifyJwt, {
    secret: config.JWT_SECRET,
    cookie: {
      cookieName: "token",
      signed: false,
    },
  });

  // Cookies
  await server.register(fastifyCookie);

  // File uploads
  await server.register(fastifyMultipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
  });

  // Use Zod for validation
  server.setValidatorCompiler(zodValidatorCompiler);
}
