import { config } from "../config";
import Redis from "ioredis";

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: false,
});

redis.on("error", (error) => {
  console.error("Redis error:", error);
});

redis.on("connect", () => {
  console.log("✅ Connected to Redis");
});

// Helper functions
export const cacheWrapper = async <T>(
  key: string,
  fn: () => Promise<T>,
  ttl: number = 3600,
): Promise<T> => {
  const cached = await redis.get(key);
  if (cached) {
    return JSON.parse(cached);
  }

  const result = await fn();
  await redis.setex(key, ttl, JSON.stringify(result));
  return result;
};
