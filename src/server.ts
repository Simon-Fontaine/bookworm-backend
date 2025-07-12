import { config } from "./config";
import { errorHandler } from "./utils/error-handler";
import { FastifyInstance } from "fastify";
import fastify from "fastify";

async function createServer(): Promise<FastifyInstance> {
  const server = fastify({
    logger: {
      level: config.NODE_ENV === "production" ? "info" : "debug",
      transport:
        config.NODE_ENV === "development"
          ? {
              target: "pino-pretty",
              options: {
                colorize: true,
                ignore: "pid,hostname",
                translateTime: "HH:MM:ss Z",
              },
            }
          : undefined,
    },
    trustProxy: true,
  });

  // Register plugins
  await import("./plugins").then(({ registerPlugins }) => registerPlugins(server));

  // Register routes
  await import("./routes").then(({ registerRoutes }) => registerRoutes(server));

  // Error handler
  server.setErrorHandler(errorHandler);

  // Health check
  server.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }));

  return server;
}

async function start() {
  try {
    const server = await createServer();
    await server.listen({ port: config.PORT, host: "0.0.0.0" });
    console.log(`🚀 Server running on http://localhost:${config.PORT}`);
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nGracefully shutting down...");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nGracefully shutting down...");
  process.exit(0);
});

start();
