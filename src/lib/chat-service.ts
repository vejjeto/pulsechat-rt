import crypto from "node:crypto";
import { type AppDatabase, getDb } from "@/db";
import { type MessageRow, type RoomRow, messages, rooms } from "@/db/schema";
import type { ChatMessageDTO, RoomDTO } from "@/shared/ws-contract";
import { and, asc, desc, eq, lt, or } from "drizzle-orm";

export interface CursorPage {
  items: ChatMessageDTO[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface DecodedCursor {
  createdAt: number;
  id: string;
}

export interface CreateRoomInput {
  slug: string;
  name: string;
  description?: string;
  isPublic?: boolean;
}

export interface CreateMessageInput {
  roomSlug: string;
  senderId: string;
  senderName: string;
  content: string;
  id?: string;
  createdAt?: number;
}

function toRoomDTO(row: RoomRow): RoomDTO {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    isPublic: row.isPublic,
    createdAt: row.createdAt,
  };
}

function toMessageDTO(row: MessageRow, roomSlug: string): ChatMessageDTO {
  return {
    id: row.id,
    roomId: row.roomId,
    roomSlug,
    senderId: row.senderId,
    senderName: row.senderName,
    content: row.content,
    createdAt: row.createdAt,
  };
}

export function encodeCursor(createdAt: number, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id }), "utf8").toString(
    "base64url",
  );
}

export function decodeCursor(raw: string): DecodedCursor | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { createdAt?: unknown; id?: unknown };
    if (
      typeof parsed.createdAt === "number" &&
      Number.isFinite(parsed.createdAt) &&
      typeof parsed.id === "string" &&
      parsed.id.length > 0
    ) {
      return { createdAt: parsed.createdAt, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

export async function listRooms(db: AppDatabase = getDb()): Promise<RoomDTO[]> {
  const rows = await db.select().from(rooms).orderBy(asc(rooms.createdAt));
  return rows.map(toRoomDTO);
}

export async function getRoomBySlug(
  slug: string,
  db: AppDatabase = getDb(),
): Promise<RoomDTO | null> {
  const [row] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.slug, slug))
    .limit(1);
  return row ? toRoomDTO(row) : null;
}

export function sanitizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createRoom(
  input: CreateRoomInput,
  db: AppDatabase = getDb(),
): Promise<RoomDTO> {
  const slug = sanitizeSlug(input.slug || input.name);
  if (!slug) {
    throw new Error("INVALID_SLUG");
  }
  const existing = await getRoomBySlug(slug, db);
  if (existing) {
    throw new Error("ROOM_ALREADY_EXISTS");
  }

  const now = Date.now();
  const id = `room-${slug}-${crypto.randomUUID().slice(0, 8)}`;
  const name = input.name.trim() || `#${slug}`;
  const description = (input.description ?? "").trim();
  const isPublic = input.isPublic ?? true;

  await db.insert(rooms).values({
    id,
    slug,
    name,
    description,
    isPublic,
    createdAt: now,
  });

  return { id, slug, name, description, isPublic, createdAt: now };
}

export async function getRoomMessages(
  roomSlug: string,
  options: { cursor?: string | null; limit?: number } = {},
  db: AppDatabase = getDb(),
): Promise<CursorPage | null> {
  const room = await getRoomBySlug(roomSlug, db);
  if (!room) {
    return null;
  }

  const requestedLimit = options.limit ?? 15;
  const limit = Math.min(Math.max(1, Math.floor(requestedLimit)), 50);
  const decoded = options.cursor ? decodeCursor(options.cursor) : null;

  if (options.cursor && !decoded) {
    throw new Error("INVALID_CURSOR");
  }

  const whereClause = decoded
    ? and(
        eq(messages.roomId, room.id),
        or(
          lt(messages.createdAt, decoded.createdAt),
          and(
            eq(messages.createdAt, decoded.createdAt),
            lt(messages.id, decoded.id),
          ),
        ),
      )
    : eq(messages.roomId, room.id);

  const rows = await db
    .select()
    .from(messages)
    .where(whereClause)
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const chronological = [...pageRows]
    .reverse()
    .map((row) => toMessageDTO(row, room.slug));
  const oldest = chronological[0];

  return {
    items: chronological,
    nextCursor:
      hasMore && oldest ? encodeCursor(oldest.createdAt, oldest.id) : null,
    hasMore,
  };
}

export async function createMessage(
  input: CreateMessageInput,
  db: AppDatabase = getDb(),
): Promise<ChatMessageDTO> {
  const room = await getRoomBySlug(input.roomSlug, db);
  if (!room) {
    throw new Error("ROOM_NOT_FOUND");
  }

  const content = input.content.trim();
  if (!content) {
    throw new Error("EMPTY_CONTENT");
  }

  const id = input.id ?? crypto.randomUUID();
  const createdAt = input.createdAt ?? Date.now();

  await db.insert(messages).values({
    id,
    roomId: room.id,
    senderId: input.senderId,
    senderName: input.senderName,
    content,
    createdAt,
  });

  return {
    id,
    roomId: room.id,
    roomSlug: room.slug,
    senderId: input.senderId,
    senderName: input.senderName,
    content,
    createdAt,
  };
}
