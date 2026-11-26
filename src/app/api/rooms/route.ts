import { createRoom, listRooms } from "@/lib/chat-service";
import { createRequestLogger, getRequestId } from "@/lib/logger";
import { CreateRoomSchema } from "@/lib/openapi";
import { jsonWithRequestId, problemResponse } from "@/lib/problem-details";
import type { NextResponse } from "next/server";

export async function GET(request: Request): Promise<NextResponse> {
  const requestId = getRequestId(request);
  const rooms = await listRooms();
  return jsonWithRequestId({ rooms }, requestId, 200);
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = getRequestId(request);
  const reqLogger = createRequestLogger(requestId);
  const instance = "/api/rooms";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problemResponse({
      status: 400,
      title: "Bad Request",
      detail: "Invalid JSON body",
      instance,
      requestId,
    });
  }

  const parsed = CreateRoomSchema.safeParse(body);
  if (!parsed.success) {
    return problemResponse({
      status: 400,
      title: "Validation Error",
      detail: parsed.error.issues[0]?.message ?? "Invalid room payload",
      instance,
      requestId,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join(".") || "body",
        message: issue.message,
      })),
    });
  }

  try {
    const room = await createRoom({
      slug: parsed.data.slug ?? parsed.data.name,
      name: parsed.data.name,
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description }
        : {}),
      ...(parsed.data.isPublic !== undefined
        ? { isPublic: parsed.data.isPublic }
        : {}),
    });
    return jsonWithRequestId({ room }, requestId, 201);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to create room";
    if (message === "ROOM_ALREADY_EXISTS") {
      return problemResponse({
        status: 409,
        title: "Conflict",
        detail: "La sala ya existe",
        instance,
        requestId,
      });
    }
    if (message === "INVALID_SLUG") {
      return problemResponse({
        status: 400,
        title: "Bad Request",
        detail: "Slug inválido",
        instance,
        requestId,
      });
    }
    reqLogger.error({ err }, "Failed to create room");
    return problemResponse({
      status: 500,
      title: "Internal Server Error",
      detail: "Error interno creando sala",
      instance,
      requestId,
    });
  }
}
