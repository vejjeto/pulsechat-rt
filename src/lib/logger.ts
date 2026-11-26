import crypto from "node:crypto";
import pino, { type DestinationStream, type Logger } from "pino";

const REDACT_PATHS = [
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "DATABASE_URL",
  "POSTGRES_URL",
  "*.password",
  "*.token",
  "*.secret",
  "*.authorization",
  "*.cookie",
  "req.headers.authorization",
  "req.headers.cookie",
  "headers.authorization",
  "headers.cookie",
];

export function createLogger(options?: {
  level?: string;
  destination?: DestinationStream;
}): Logger {
  const level =
    options?.level ??
    process.env.LOG_LEVEL ??
    (process.env.NODE_ENV === "test" ? "silent" : "info");

  const config: pino.LoggerOptions = {
    level,
    base: { service: "pulsechat-rt" },
    redact: {
      paths: REDACT_PATHS,
      censor: "[REDACTED]",
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  return options?.destination
    ? pino(config, options.destination)
    : pino(config);
}

export const logger: Logger = createLogger();

export function getRequestId(request?: Request): string {
  const incoming = request?.headers.get("x-request-id")?.trim();
  if (incoming && incoming.length > 0) {
    return incoming;
  }
  return crypto.randomUUID();
}

export function createRequestLogger(
  requestId: string,
  baseLogger: Logger = logger,
): Logger {
  return baseLogger.child({ requestId });
}
