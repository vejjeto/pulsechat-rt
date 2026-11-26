import { logger } from "@/lib/logger";
import { applySchema, createDatabase } from "./index";

export async function runMigrate(overrideUrl?: string): Promise<void> {
  const bundle = createDatabase(overrideUrl, { seed: false });
  try {
    applySchema(bundle.sqlite);
  } finally {
    bundle.close();
  }
}

const isCli =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith("migrate.ts");

if (isCli) {
  runMigrate()
    .then(() => {
      logger.info("SQLite schema initialized successfully");
    })
    .catch((error: unknown) => {
      logger.error({ err: error }, "SQLite migration failed");
      process.exit(1);
    });
}
