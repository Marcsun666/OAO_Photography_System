import { logger } from "@/lib/logger";

export async function sendNotification(params: {
  subject: string;
  audience: string;
  message: string;
}) {
  logger.info({ notification: params }, "Dispatching club notification");
  return { delivered: false, mode: "log-only" as const };
}
