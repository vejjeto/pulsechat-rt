import { getDb } from "@/db";
import { rooms } from "@/db/schema";
import { createRequestLogger, getRequestId } from "@/lib/logger";
import type { HealthResponse } from "@/lib/openapi";
import { jsonWithRequestId, problemResponse } from "@/lib/problem-details";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  const reqLogger = createRequestLogger(requestId);
  const start = performance.now();

  try {
    await getDb().select({ id: rooms.id }).from(rooms).limit(1);
    const latencyMs = Math.max(
      0,
      Math.round((performance.now() - start) * 100) / 100,
    );
    const payload: HealthResponse = {
      status: "ok",
      service: "pulsechat-rt",
      version: "2.0.0",
      uptimeSec: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: {
        database: {
          status: "up",
          latencyMs,
        },
      },
    };
    return jsonWithRequestId(payload, requestId, 200);
  } catch (err: unknown) {
    reqLogger.error({ err }, "Database health check failed");
    return problemResponse({
      status: 503,
      title: "Service Unavailable",
      detail:
        err instanceof Error ? err.message : "Database health check failed",
      instance: "/api/health",
      requestId,
    });
  }
}
