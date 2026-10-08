import pino from "pino";

export const logger = pino({
  name: "oao-club-platform",
  level: process.env.LOG_LEVEL ?? "info",
});
