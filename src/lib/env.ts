import { z } from "zod";

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3005),
  DATABASE_URL: z.string().trim().min(1).default("data/app.db"),
  POSTGRES_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  NEXT_PUBLIC_APP_URL: z.preprocess(
    emptyToUndefined,
    z.string().url().default("http://localhost:3005"),
  ),
});

export interface AppEnv {
  PORT: number;
  DATABASE_URL: string;
  POSTGRES_URL: string | undefined;
  NEXT_PUBLIC_APP_URL: string;
}

export function parseEnv(
  raw: Record<string, string | undefined> = process.env,
): AppEnv {
  if (raw.SKIP_ENV_VALIDATION === "true") {
    const port = Number.parseInt(raw.PORT ?? "3005", 10);
    return {
      PORT: Number.isFinite(port) && port >= 1 && port <= 65535 ? port : 3005,
      DATABASE_URL: raw.DATABASE_URL?.trim() || "data/app.db",
      POSTGRES_URL: raw.POSTGRES_URL?.trim() || undefined,
      NEXT_PUBLIC_APP_URL:
        raw.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3005",
    };
  }

  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return {
    PORT: parsed.data.PORT,
    DATABASE_URL: parsed.data.DATABASE_URL,
    POSTGRES_URL: parsed.data.POSTGRES_URL,
    NEXT_PUBLIC_APP_URL: parsed.data.NEXT_PUBLIC_APP_URL,
  };
}

export function getEnv(): AppEnv {
  return parseEnv(process.env);
}

export const env: AppEnv = parseEnv(process.env);
