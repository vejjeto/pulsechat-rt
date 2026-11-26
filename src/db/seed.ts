import { logger } from "@/lib/logger";
import { applySchema, createDatabase, ensureDemoData } from "./index";

export async function runSeed(
  overrideUrl?: string,
): Promise<{ rooms: number; messages: number }> {
  const bundle = createDatabase(overrideUrl, { seed: false });
  try {
    applySchema(bundle.sqlite);
    ensureDemoData(bundle.sqlite);
    const roomCount = bundle.sqlite
      .prepare("SELECT COUNT(*) as c FROM rooms")
      .get() as { c: number };
    const msgCount = bundle.sqlite
      .prepare("SELECT COUNT(*) as c FROM messages")
      .get() as { c: number };
    return { rooms: roomCount.c, messages: msgCount.c };
  } finally {
    bundle.close();
  }
}

const isCli =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith("seed.ts");

if (isCli) {
  runSeed()
    .then(({ rooms, messages }) => {
      logger.info({ rooms, messages }, "Seeded database idempotently");
    })
    .catch((error: unknown) => {
      logger.error({ err: error }, "Database seed failed");
      process.exit(1);
    });
}
