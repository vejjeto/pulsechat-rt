import http from "node:http";
import next from "next";
import { WebSocketServer } from "ws";
import { closeGlobalDb, getDb } from "./src/db";
import { env } from "./src/lib/env";
import { logger } from "./src/lib/logger";
import { ChatHub } from "./src/ws/hub";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const port = env.PORT;

async function bootstrap(): Promise<void> {
  const db = getDb();
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();
  const handleUpgrade = app.getUpgradeHandler();

  const server = http.createServer((req, res) => {
    void handle(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });
  const hub = new ChatHub({ db });
  hub.startHeartbeat(30_000);

  server.on("upgrade", (req, socket, head) => {
    const pathname = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    ).pathname;
    if (pathname === "/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        hub.handleConnection(ws);
      });
      return;
    }
    void handleUpgrade(req, socket, head);
  });

  const shutdown = (): void => {
    hub.shutdown();
    wss.close();
    server.close(() => {
      closeGlobalDb();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  server.listen(port, hostname, () => {
    logger.info({ hostname, port, wsPath: "/ws" }, "PulseChat RT server ready");
  });
}

bootstrap().catch((error: unknown) => {
  logger.error({ err: error }, "PulseChat RT server bootstrap failed");
  process.exit(1);
});
