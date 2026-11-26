import { getRoomMessages } from "@/lib/chat-service";
import { createRequestLogger, getRequestId } from "@/lib/logger";
import { jsonWithRequestId, problemResponse } from "@/lib/problem-details";
import type { NextResponse } from "next/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const requestId = getRequestId(request);
  const reqLogger = createRequestLogger(requestId);
  const { slug } = await context.params;
  const instance = `/api/rooms/${slug}/messages`;

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const rawLimit = searchParams.get("limit");
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : 15;
  const limit = Number.isFinite(parsedLimit) ? parsedLimit : 15;

  try {
    const page = await getRoomMessages(slug, { cursor, limit });
    if (!page) {
      return problemResponse({
        status: 404,
        title: "Not Found",
        detail: "Sala no encontrada",
        instance,
        requestId,
      });
    }
    return jsonWithRequestId(page, requestId, 200);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to load messages";
    if (message === "INVALID_CURSOR") {
      return problemResponse({
        status: 400,
        title: "Bad Request",
        detail: "Cursor inválido",
        instance,
        requestId,
      });
    }
    reqLogger.error({ err, slug }, "Failed to load room messages");
    return problemResponse({
      status: 500,
      title: "Internal Server Error",
      detail: "Error cargando mensajes",
      instance,
      requestId,
    });
  }
}
