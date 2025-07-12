import { FastifyRequest } from "fastify";

export function getClientInfo(request: FastifyRequest) {
  const userAgent = request.headers["user-agent"] || "";
  const ipAddress = request.ip;

  // Parse device info from user agent
  const device = parseDevice(userAgent);

  return {
    ipAddress,
    userAgent,
    device,
  };
}

function parseDevice(userAgent: string): string {
  if (/mobile/i.test(userAgent)) return "Mobile";
  if (/tablet/i.test(userAgent)) return "Tablet";
  if (/bot/i.test(userAgent)) return "Bot";
  return "Desktop";
}
