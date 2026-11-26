import { type AppDatabase, getDb } from "@/db";
import { createMessage } from "@/lib/chat-service";
import { generateSyncBotReply, shouldSyncBotRespond } from "@/lib/syncbot";
import {
  type ClientEvent,
  type PresenceMember,
  type ServerEvent,
  type TypingUser,
  parseClientEvent,
} from "@/shared/ws-contract";

export const WS_READY_OPEN = 1;

export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  ping(): void;
  terminate(): void;
  close(): void;
  on?(event: string, listener: (...args: never[]) => void): unknown;
}

interface ClientSession {
  ws: SocketLike;
  clientId: string;
  alias: string;
  roomSlug: string | null;
  joinedAt: number;
  isAlive: boolean;
}

export interface ChatHubOptions {
  db?: AppDatabase;
  botDelayMs?: number;
  typingTtlMs?: number;
}

interface AckRecord {
  messageId: string;
  createdAt: number;
}

const MAX_ACK_CACHE = 500;

export class ChatHub {
  private readonly db: AppDatabase;
  private readonly botDelayMs: number;
  private readonly typingTtlMs: number;
  private readonly sessions = new Map<SocketLike, ClientSession>();
  private readonly rooms = new Map<string, Set<SocketLike>>();
  private readonly typingByRoom = new Map<string, Map<string, TypingUser>>();
  private readonly typingTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly botTimers = new Set<ReturnType<typeof setTimeout>>();
  private readonly ackCache = new Map<string, AckRecord>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: ChatHubOptions = {}) {
    this.db = options.db ?? getDb();
    this.botDelayMs = options.botDelayMs ?? 900;
    this.typingTtlMs = options.typingTtlMs ?? 5000;
  }

  public handleConnection(ws: SocketLike): void {
    this.registerSocket(ws);
    if (!ws.on) {
      return;
    }

    ws.on("message", ((raw: Buffer | ArrayBuffer | Buffer[] | string) => {
      const text =
        typeof raw === "string"
          ? raw
          : Buffer.isBuffer(raw)
            ? raw.toString("utf8")
            : String(raw);
      void this.handleRawMessage(ws, text);
    }) as (...args: never[]) => void);

    ws.on("pong", (() => {
      this.handlePong(ws);
    }) as (...args: never[]) => void);

    ws.on("close", (() => {
      this.handleClose(ws);
    }) as (...args: never[]) => void);

    ws.on("error", (() => {
      this.handleClose(ws);
    }) as (...args: never[]) => void);
  }

  public registerSocket(ws: SocketLike): void {
    this.sessions.set(ws, {
      ws,
      clientId: "",
      alias: "",
      roomSlug: null,
      joinedAt: Date.now(),
      isAlive: true,
    });
  }

  public handlePong(ws: SocketLike): void {
    const session = this.sessions.get(ws);
    if (session) {
      session.isAlive = true;
    }
  }

  public handleClose(ws: SocketLike): void {
    const session = this.sessions.get(ws);
    if (!session) {
      return;
    }
    const previousRoom = session.roomSlug;
    const previousClientId = session.clientId;
    this.sessions.delete(ws);

    if (previousRoom) {
      this.removeFromRoom(ws, previousRoom, previousClientId);
    }
  }

  public async handleRawMessage(
    ws: SocketLike,
    rawText: string,
  ): Promise<void> {
    const session = this.sessions.get(ws);
    if (session) {
      session.isAlive = true;
    }

    const parsed = parseClientEvent(rawText);
    if (!parsed.ok) {
      this.sendEvent(ws, {
        type: "error:event",
        code: "INVALID_EVENT",
        message: parsed.error,
      });
      return;
    }

    await this.dispatchEvent(ws, parsed.data);
  }

  public startHeartbeat(intervalMs = 30_000): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    this.heartbeatTimer = setInterval(() => {
      this.sweepStaleConnections();
    }, intervalMs);
    this.heartbeatTimer.unref?.();
  }

  public sweepStaleConnections(): number {
    let pruned = 0;
    for (const [ws, session] of Array.from(this.sessions.entries())) {
      if (!session.isAlive) {
        this.handleClose(ws);
        ws.terminate();
        pruned += 1;
        continue;
      }
      session.isAlive = false;
      try {
        ws.ping();
      } catch {
        this.handleClose(ws);
        ws.terminate();
        pruned += 1;
      }
    }
    return pruned;
  }

  public getRoomPresence(roomSlug: string): PresenceMember[] {
    const sockets = this.rooms.get(roomSlug);
    if (!sockets) {
      return [];
    }
    const byClient = new Map<string, PresenceMember>();
    for (const ws of sockets) {
      const session = this.sessions.get(ws);
      if (session?.clientId) {
        byClient.set(session.clientId, {
          clientId: session.clientId,
          alias: session.alias,
          joinedAt: session.joinedAt,
        });
      }
    }
    return Array.from(byClient.values());
  }

  public shutdown(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const timer of this.typingTimers.values()) {
      clearTimeout(timer);
    }
    this.typingTimers.clear();
    for (const timer of this.botTimers) {
      clearTimeout(timer);
    }
    this.botTimers.clear();
    for (const ws of this.sessions.keys()) {
      ws.close();
    }
    this.sessions.clear();
    this.rooms.clear();
    this.typingByRoom.clear();
  }

  private async dispatchEvent(
    ws: SocketLike,
    event: ClientEvent,
  ): Promise<void> {
    switch (event.type) {
      case "ping":
        this.sendEvent(ws, { type: "pong", ts: event.ts ?? Date.now() });
        return;
      case "room:join":
        this.onRoomJoin(ws, event);
        return;
      case "room:leave":
        this.onRoomLeave(ws, event);
        return;
      case "typing:start":
        this.setTyping(event.roomSlug, event.clientId, event.alias, true);
        return;
      case "typing:stop":
        this.setTyping(event.roomSlug, event.clientId, "", false);
        return;
      case "message:send":
        await this.onMessageSend(ws, event);
        return;
    }
  }

  private onRoomJoin(
    ws: SocketLike,
    event: Extract<ClientEvent, { type: "room:join" }>,
  ): void {
    const session = this.sessions.get(ws);
    if (!session) {
      this.registerSocket(ws);
    }
    const active = this.sessions.get(ws);
    if (!active) {
      return;
    }

    if (active.roomSlug && active.roomSlug !== event.roomSlug) {
      this.removeFromRoom(ws, active.roomSlug, active.clientId);
    }

    active.clientId = event.clientId;
    active.alias = event.alias;
    active.roomSlug = event.roomSlug;
    active.joinedAt = Date.now();

    let roomSet = this.rooms.get(event.roomSlug);
    if (!roomSet) {
      roomSet = new Set<SocketLike>();
      this.rooms.set(event.roomSlug, roomSet);
    }
    roomSet.add(ws);

    const members = this.getRoomPresence(event.roomSlug);
    this.sendEvent(ws, {
      type: "room:joined",
      roomSlug: event.roomSlug,
      members,
    });
    this.broadcastToRoom(event.roomSlug, {
      type: "presence:update",
      roomSlug: event.roomSlug,
      members,
    });
    this.sendEvent(ws, {
      type: "typing:update",
      roomSlug: event.roomSlug,
      typingUsers: this.getTypingUsers(event.roomSlug),
    });
  }

  private onRoomLeave(
    ws: SocketLike,
    event: Extract<ClientEvent, { type: "room:leave" }>,
  ): void {
    const session = this.sessions.get(ws);
    if (session && session.roomSlug === event.roomSlug) {
      session.roomSlug = null;
    }
    this.removeFromRoom(ws, event.roomSlug, event.clientId);
  }

  private removeFromRoom(
    ws: SocketLike,
    roomSlug: string,
    clientId: string,
  ): void {
    const roomSet = this.rooms.get(roomSlug);
    if (roomSet) {
      roomSet.delete(ws);
      if (roomSet.size === 0) {
        this.rooms.delete(roomSlug);
      }
    }

    if (clientId) {
      this.setTyping(roomSlug, clientId, "", false);
    }

    if (this.rooms.has(roomSlug)) {
      this.broadcastToRoom(roomSlug, {
        type: "presence:update",
        roomSlug,
        members: this.getRoomPresence(roomSlug),
      });
    }
  }

  private async onMessageSend(
    ws: SocketLike,
    event: Extract<ClientEvent, { type: "message:send" }>,
  ): Promise<void> {
    const idempotencyKey = `${event.senderId}:${event.clientTempId}`;
    const existingAck = this.ackCache.get(idempotencyKey);
    if (existingAck) {
      this.sendEvent(ws, {
        type: "message:ack",
        roomSlug: event.roomSlug,
        clientTempId: event.clientTempId,
        messageId: existingAck.messageId,
        createdAt: existingAck.createdAt,
      });
      return;
    }

    this.setTyping(event.roomSlug, event.senderId, "", false);

    let saved: Awaited<ReturnType<typeof createMessage>>;
    try {
      saved = await createMessage(
        {
          roomSlug: event.roomSlug,
          senderId: event.senderId,
          senderName: event.senderName,
          content: event.content,
        },
        this.db,
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to persist message";
      this.sendEvent(ws, {
        type: "error:event",
        code: "MESSAGE_PERSIST_FAILED",
        message: msg,
      });
      return;
    }

    this.rememberAck(idempotencyKey, {
      messageId: saved.id,
      createdAt: saved.createdAt,
    });

    this.sendEvent(ws, {
      type: "message:ack",
      roomSlug: event.roomSlug,
      clientTempId: event.clientTempId,
      messageId: saved.id,
      createdAt: saved.createdAt,
    });

    this.broadcastToRoom(event.roomSlug, {
      type: "message:new",
      message: {
        ...saved,
        clientTempId: event.clientTempId,
      },
    });

    if (shouldSyncBotRespond(event.roomSlug, event.senderId)) {
      this.scheduleSyncBotReply(
        event.roomSlug,
        event.senderName,
        event.content,
      );
    }
  }

  private rememberAck(key: string, record: AckRecord): void {
    if (this.ackCache.size >= MAX_ACK_CACHE) {
      const oldestKey = this.ackCache.keys().next().value;
      if (oldestKey) {
        this.ackCache.delete(oldestKey);
      }
    }
    this.ackCache.set(key, record);
  }

  private scheduleSyncBotReply(
    roomSlug: string,
    senderName: string,
    content: string,
  ): void {
    this.setTyping(roomSlug, "syncbot", "SyncBot", true);
    const timer = setTimeout(() => {
      this.botTimers.delete(timer);
      void this.emitSyncBotMessage(roomSlug, senderName, content);
    }, this.botDelayMs);
    timer.unref?.();
    this.botTimers.add(timer);
  }

  private async emitSyncBotMessage(
    roomSlug: string,
    senderName: string,
    content: string,
  ): Promise<void> {
    this.setTyping(roomSlug, "syncbot", "", false);
    if (!this.rooms.has(roomSlug)) {
      return;
    }

    try {
      const replyContent = generateSyncBotReply(content, roomSlug, senderName);
      const saved = await createMessage(
        {
          roomSlug,
          senderId: "syncbot",
          senderName: "SyncBot",
          content: replyContent,
        },
        this.db,
      );
      this.broadcastToRoom(roomSlug, {
        type: "message:new",
        message: saved,
      });
    } catch {
      // Ignore transient errors if room was deleted or DB closed during shutdown
    }
  }

  private setTyping(
    roomSlug: string,
    clientId: string,
    alias: string,
    isTyping: boolean,
  ): void {
    const timerKey = `${roomSlug}:${clientId}`;
    const existingTimer = this.typingTimers.get(timerKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.typingTimers.delete(timerKey);
    }

    let roomTyping = this.typingByRoom.get(roomSlug);
    if (isTyping) {
      if (!roomTyping) {
        roomTyping = new Map<string, TypingUser>();
        this.typingByRoom.set(roomSlug, roomTyping);
      }
      roomTyping.set(clientId, { clientId, alias });
      const ttl = setTimeout(() => {
        this.typingTimers.delete(timerKey);
        this.setTyping(roomSlug, clientId, "", false);
      }, this.typingTtlMs);
      ttl.unref?.();
      this.typingTimers.set(timerKey, ttl);
    } else if (roomTyping) {
      roomTyping.delete(clientId);
      if (roomTyping.size === 0) {
        this.typingByRoom.delete(roomSlug);
      }
    }

    this.broadcastToRoom(roomSlug, {
      type: "typing:update",
      roomSlug,
      typingUsers: this.getTypingUsers(roomSlug),
    });
  }

  private getTypingUsers(roomSlug: string): TypingUser[] {
    const map = this.typingByRoom.get(roomSlug);
    return map ? Array.from(map.values()) : [];
  }

  private broadcastToRoom(roomSlug: string, event: ServerEvent): void {
    const sockets = this.rooms.get(roomSlug);
    if (!sockets) {
      return;
    }
    const payload = JSON.stringify(event);
    for (const ws of sockets) {
      if (ws.readyState === WS_READY_OPEN) {
        ws.send(payload);
      }
    }
  }

  private sendEvent(ws: SocketLike, event: ServerEvent): void {
    if (ws.readyState === WS_READY_OPEN) {
      ws.send(JSON.stringify(event));
    }
  }
}
