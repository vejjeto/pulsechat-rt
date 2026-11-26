import { z } from "zod";

export const PresenceMemberSchema = z.object({
  clientId: z.string().min(1).max(80),
  alias: z.string().min(1).max(40),
  joinedAt: z.number().int().nonnegative(),
});

export const TypingUserSchema = z.object({
  clientId: z.string().min(1).max(80),
  alias: z.string().min(1).max(40),
});

export const ChatMessageSchema = z.object({
  id: z.string().min(1).max(120),
  roomId: z.string().min(1).max(120),
  roomSlug: z.string().min(1).max(60),
  senderId: z.string().min(1).max(80),
  senderName: z.string().min(1).max(40),
  content: z.string().min(1).max(2000),
  createdAt: z.number().int().nonnegative(),
  clientTempId: z.string().min(1).max(120).optional(),
});

export const RoomSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  isPublic: z.boolean(),
  createdAt: z.number().int().nonnegative(),
});

export const ClientEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("room:join"),
    roomSlug: z.string().trim().min(1).max(60),
    clientId: z.string().trim().min(1).max(80),
    alias: z.string().trim().min(1).max(40),
  }),
  z.object({
    type: z.literal("room:leave"),
    roomSlug: z.string().trim().min(1).max(60),
    clientId: z.string().trim().min(1).max(80),
  }),
  z.object({
    type: z.literal("message:send"),
    roomSlug: z.string().trim().min(1).max(60),
    clientTempId: z.string().trim().min(1).max(120),
    senderId: z.string().trim().min(1).max(80),
    senderName: z.string().trim().min(1).max(40),
    content: z.string().trim().min(1).max(2000),
  }),
  z.object({
    type: z.literal("typing:start"),
    roomSlug: z.string().trim().min(1).max(60),
    clientId: z.string().trim().min(1).max(80),
    alias: z.string().trim().min(1).max(40),
  }),
  z.object({
    type: z.literal("typing:stop"),
    roomSlug: z.string().trim().min(1).max(60),
    clientId: z.string().trim().min(1).max(80),
  }),
  z.object({
    type: z.literal("ping"),
    ts: z.number().int().nonnegative().optional(),
  }),
]);

export const ServerEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("room:joined"),
    roomSlug: z.string().min(1),
    members: z.array(PresenceMemberSchema),
  }),
  z.object({
    type: z.literal("message:new"),
    message: ChatMessageSchema,
  }),
  z.object({
    type: z.literal("message:ack"),
    roomSlug: z.string().min(1),
    clientTempId: z.string().min(1),
    messageId: z.string().min(1),
    createdAt: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("typing:update"),
    roomSlug: z.string().min(1),
    typingUsers: z.array(TypingUserSchema),
  }),
  z.object({
    type: z.literal("presence:update"),
    roomSlug: z.string().min(1),
    members: z.array(PresenceMemberSchema),
  }),
  z.object({
    type: z.literal("pong"),
    ts: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("error:event"),
    code: z.string().min(1),
    message: z.string().min(1),
  }),
]);

export type PresenceMember = z.infer<typeof PresenceMemberSchema>;
export type TypingUser = z.infer<typeof TypingUserSchema>;
export type ChatMessageDTO = z.infer<typeof ChatMessageSchema>;
export type RoomDTO = z.infer<typeof RoomSchema>;
export type ClientEvent = z.infer<typeof ClientEventSchema>;
export type ServerEvent = z.infer<typeof ServerEventSchema>;

export function parseClientEvent(
  raw: string,
): { ok: true; data: ClientEvent } | { ok: false; error: string } {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Invalid JSON payload" };
  }
  const result = ClientEventSchema.safeParse(parsedJson);
  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues[0]?.message ?? "Invalid WS event",
    };
  }
  return { ok: true, data: result.data };
}

export function parseServerEvent(
  raw: string,
): { ok: true; data: ServerEvent } | { ok: false; error: string } {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Invalid JSON payload" };
  }
  const result = ServerEventSchema.safeParse(parsedJson);
  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues[0]?.message ?? "Invalid server event",
    };
  }
  return { ok: true, data: result.data };
}
