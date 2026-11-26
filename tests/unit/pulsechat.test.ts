import { GET as getDocs } from "@/app/api/docs/route";
import { GET as getHealth } from "@/app/api/health/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { GET as getRoomMessagesRoute } from "@/app/api/rooms/[slug]/messages/route";
import { POST as postRoom } from "@/app/api/rooms/route";
import { createDatabase, ensureDemoData } from "@/db";
import { calculateBackoffDelay } from "@/lib/backoff";
import { createMessage, getRoomMessages, listRooms } from "@/lib/chat-service";
import { parseEnv } from "@/lib/env";
import { TRANSLATIONS } from "@/lib/i18n";
import { HealthResponseSchema } from "@/lib/openapi";
import { ProblemDetailsSchema } from "@/lib/problem-details";
import { generateSyncBotReply, shouldSyncBotRespond } from "@/lib/syncbot";
import {
  type ServerEvent,
  parseClientEvent,
  parseServerEvent,
} from "@/shared/ws-contract";
import { ChatHub, type SocketLike, WS_READY_OPEN } from "@/ws/hub";
import { describe, expect, it } from "vitest";

class MockSocket implements SocketLike {
  public readyState = WS_READY_OPEN;
  public sent: string[] = [];
  public pingCount = 0;
  public terminated = false;
  public closed = false;

  public send(data: string): void {
    this.sent.push(data);
  }

  public ping(): void {
    this.pingCount += 1;
  }

  public terminate(): void {
    this.terminated = true;
    this.readyState = 3;
  }

  public close(): void {
    this.closed = true;
    this.readyState = 3;
  }

  public parsedEvents(): ServerEvent[] {
    return this.sent.map((raw) => JSON.parse(raw) as ServerEvent);
  }
}

describe("Exponential Backoff", () => {
  it("computes bounded exponential delay with jitter and caps base at 30000ms", () => {
    expect(calculateBackoffDelay(0, () => 0)).toBe(1000);
    expect(calculateBackoffDelay(0, () => 0.5)).toBe(1500);
    expect(calculateBackoffDelay(3, () => 0)).toBe(8000);
    expect(calculateBackoffDelay(3, () => 0.999)).toBe(8999);
    expect(calculateBackoffDelay(10, () => 0)).toBe(30000);
    expect(calculateBackoffDelay(10, () => 0.999)).toBe(30999);
    expect(calculateBackoffDelay(-2, () => 0.25)).toBe(1250);
  });
});

describe("Shared Zod WS Contract", () => {
  it("validates Client->Server events and rejects malformed payloads", () => {
    const validSend = parseClientEvent(
      JSON.stringify({
        type: "message:send",
        roomSlug: "sandbox",
        clientTempId: "temp-123",
        senderId: "u-1",
        senderName: "Ana",
        content: "Hola WS",
      }),
    );
    expect(validSend.ok).toBe(true);
    if (validSend.ok) {
      expect(validSend.data.type).toBe("message:send");
    }

    const emptyContent = parseClientEvent(
      JSON.stringify({
        type: "message:send",
        roomSlug: "sandbox",
        clientTempId: "temp-123",
        senderId: "u-1",
        senderName: "Ana",
        content: "   ",
      }),
    );
    expect(emptyContent.ok).toBe(false);

    const unknownType = parseClientEvent(
      JSON.stringify({ type: "admin:nuke" }),
    );
    expect(unknownType.ok).toBe(false);

    const invalidJson = parseClientEvent("{broken-json");
    expect(invalidJson.ok).toBe(false);
  });

  it("validates Server->Client events including message:ack and error:event", () => {
    const ack = parseServerEvent(
      JSON.stringify({
        type: "message:ack",
        roomSlug: "sandbox",
        clientTempId: "temp-abc",
        messageId: "msg-999",
        createdAt: 1700000000000,
      }),
    );
    expect(ack.ok).toBe(true);

    const badAck = parseServerEvent(
      JSON.stringify({
        type: "message:ack",
        roomSlug: "sandbox",
        clientTempId: "temp-abc",
        messageId: "msg-999",
        createdAt: -5,
      }),
    );
    expect(badAck.ok).toBe(false);
  });
});

describe("Database Seed & Cursor Pagination", () => {
  it("seeds 3 rooms and 45 demo messages idempotently", async () => {
    const bundle = createDatabase(":memory:", { seed: true });
    try {
      ensureDemoData(bundle.sqlite);
      const rooms = await listRooms(bundle.db);
      expect(rooms.map((r) => r.slug)).toEqual([
        "sandbox",
        "general",
        "arquitectura",
      ]);

      const sandboxAll = await getRoomMessages(
        "sandbox",
        { limit: 50 },
        bundle.db,
      );
      const generalAll = await getRoomMessages(
        "general",
        { limit: 50 },
        bundle.db,
      );
      expect(sandboxAll?.items.length).toBe(25);
      expect(generalAll?.items.length).toBe(20);
    } finally {
      bundle.close();
    }
  });

  it("paginates backwards without duplicates or skips even when live messages arrive", async () => {
    const bundle = createDatabase(":memory:", { seed: true });
    try {
      const page1 = await getRoomMessages("sandbox", { limit: 15 }, bundle.db);
      expect(page1).not.toBeNull();
      expect(page1?.items.length).toBe(15);
      expect(page1?.hasMore).toBe(true);
      expect(page1?.nextCursor).not.toBeNull();

      // Verify chronological ascending order on page 1
      const p1Times = page1!.items.map((m) => m.createdAt);
      expect(p1Times).toEqual([...p1Times].sort((a, b) => a - b));

      // Insert a brand-new live message before fetching page 2
      await createMessage(
        {
          roomSlug: "sandbox",
          senderId: "live-user",
          senderName: "Live",
          content: "Mensaje nuevo mientras el usuario lee historial",
          createdAt: Date.now() + 50_000,
        },
        bundle.db,
      );

      const page2 = await getRoomMessages(
        "sandbox",
        { cursor: page1!.nextCursor, limit: 15 },
        bundle.db,
      );
      expect(page2?.items.length).toBe(10);
      expect(page2?.hasMore).toBe(false);
      expect(page2?.nextCursor).toBeNull();

      const combinedIds = [...page2!.items, ...page1!.items].map((m) => m.id);
      expect(new Set(combinedIds).size).toBe(25);
      expect(page2!.items.at(-1)!.createdAt).toBeLessThan(
        page1!.items[0]!.createdAt,
      );
    } finally {
      bundle.close();
    }
  });

  it("breaks timestamp ties deterministically using (createdAt, id) cursor", async () => {
    const bundle = createDatabase(":memory:", { seed: true });
    try {
      const sameTs = 1800000000000;
      await createMessage(
        {
          id: "tie-a",
          roomSlug: "arquitectura",
          senderId: "u1",
          senderName: "U1",
          content: "A",
          createdAt: sameTs,
        },
        bundle.db,
      );
      await createMessage(
        {
          id: "tie-b",
          roomSlug: "arquitectura",
          senderId: "u1",
          senderName: "U1",
          content: "B",
          createdAt: sameTs,
        },
        bundle.db,
      );
      await createMessage(
        {
          id: "tie-c",
          roomSlug: "arquitectura",
          senderId: "u1",
          senderName: "U1",
          content: "C",
          createdAt: sameTs,
        },
        bundle.db,
      );

      const first = await getRoomMessages(
        "arquitectura",
        { limit: 2 },
        bundle.db,
      );
      expect(first?.items.map((m) => m.id)).toEqual(["tie-b", "tie-c"]);
      expect(first?.hasMore).toBe(true);

      const second = await getRoomMessages(
        "arquitectura",
        { cursor: first!.nextCursor, limit: 2 },
        bundle.db,
      );
      expect(second?.items.map((m) => m.id)).toEqual(["tie-a"]);
      expect(second?.hasMore).toBe(false);
    } finally {
      bundle.close();
    }
  });
});

describe("ChatHub WS Lifecycle, Idempotency & Heartbeat", () => {
  it("handles room join, presence, message:ack, broadcast, clientTempId idempotency, and leave", async () => {
    const bundle = createDatabase(":memory:", { seed: true });
    const hub = new ChatHub({ db: bundle.db, botDelayMs: 5000 });
    const sockA = new MockSocket();
    const sockB = new MockSocket();

    try {
      hub.registerSocket(sockA);
      hub.registerSocket(sockB);

      await hub.handleRawMessage(
        sockA,
        JSON.stringify({
          type: "room:join",
          roomSlug: "arquitectura",
          clientId: "c-a",
          alias: "Alice",
        }),
      );
      await hub.handleRawMessage(
        sockB,
        JSON.stringify({
          type: "room:join",
          roomSlug: "arquitectura",
          clientId: "c-b",
          alias: "Bob",
        }),
      );

      expect(hub.getRoomPresence("arquitectura").map((m) => m.alias)).toEqual([
        "Alice",
        "Bob",
      ]);

      sockA.sent = [];
      sockB.sent = [];

      const sendPayload = JSON.stringify({
        type: "message:send",
        roomSlug: "arquitectura",
        clientTempId: "tmp-idempotent-1",
        senderId: "c-a",
        senderName: "Alice",
        content: "Probando ACK e idempotencia",
      });

      await hub.handleRawMessage(sockA, sendPayload);
      const eventsA = sockA.parsedEvents();
      const ackEvent = eventsA.find((e) => e.type === "message:ack");
      const newEventA = eventsA.find((e) => e.type === "message:new");
      const newEventB = sockB
        .parsedEvents()
        .find((e) => e.type === "message:new");

      expect(ackEvent?.type).toBe("message:ack");
      expect(newEventA?.type).toBe("message:new");
      expect(newEventB?.type).toBe("message:new");
      if (
        ackEvent?.type === "message:ack" &&
        newEventB?.type === "message:new"
      ) {
        expect(ackEvent.clientTempId).toBe("tmp-idempotent-1");
        expect(newEventB.message.id).toBe(ackEvent.messageId);
      }

      // Duplicate resend with same clientTempId should only re-ack, not insert or broadcast twice
      sockB.sent = [];
      await hub.handleRawMessage(sockA, sendPayload);
      expect(sockB.parsedEvents().some((e) => e.type === "message:new")).toBe(
        false,
      );
      const stored = await getRoomMessages(
        "arquitectura",
        { limit: 10 },
        bundle.db,
      );
      expect(stored?.items.length).toBe(1);

      await hub.handleRawMessage(
        sockB,
        JSON.stringify({
          type: "room:leave",
          roomSlug: "arquitectura",
          clientId: "c-b",
        }),
      );
      expect(hub.getRoomPresence("arquitectura").map((m) => m.alias)).toEqual([
        "Alice",
      ]);
    } finally {
      hub.shutdown();
      bundle.close();
    }
  });

  it("prunes unresponsive sockets on heartbeat sweep and updates presence:update", async () => {
    const bundle = createDatabase(":memory:", { seed: true });
    const hub = new ChatHub({ db: bundle.db });
    const healthy = new MockSocket();
    const stale = new MockSocket();

    try {
      hub.registerSocket(healthy);
      hub.registerSocket(stale);

      await hub.handleRawMessage(
        healthy,
        JSON.stringify({
          type: "room:join",
          roomSlug: "sandbox",
          clientId: "c-1",
          alias: "Healthy",
        }),
      );
      await hub.handleRawMessage(
        stale,
        JSON.stringify({
          type: "room:join",
          roomSlug: "sandbox",
          clientId: "c-2",
          alias: "Stale",
        }),
      );

      // First sweep pings both and marks isAlive = false
      expect(hub.sweepStaleConnections()).toBe(0);
      expect(healthy.pingCount).toBe(1);
      expect(stale.pingCount).toBe(1);

      // Only healthy replies with pong
      hub.handlePong(healthy);
      healthy.sent = [];

      // Second sweep terminates stale and notifies healthy
      expect(hub.sweepStaleConnections()).toBe(1);
      expect(stale.terminated).toBe(true);
      expect(hub.getRoomPresence("sandbox").map((m) => m.alias)).toEqual([
        "Healthy",
      ]);

      const presenceUpdate = healthy
        .parsedEvents()
        .find((e) => e.type === "presence:update");
      expect(presenceUpdate?.type).toBe("presence:update");
      if (presenceUpdate?.type === "presence:update") {
        expect(presenceUpdate.members.map((m) => m.alias)).toEqual(["Healthy"]);
      }
    } finally {
      hub.shutdown();
      bundle.close();
    }
  });
});

describe("@SyncBot Trigger & Contextual Reply", () => {
  it("triggers typing:update and persists contextual bot reply in #sandbox and #general", async () => {
    expect(shouldSyncBotRespond("sandbox", "guest-1")).toBe(true);
    expect(shouldSyncBotRespond("general", "guest-1")).toBe(true);
    expect(shouldSyncBotRespond("arquitectura", "guest-1")).toBe(false);
    expect(shouldSyncBotRespond("sandbox", "syncbot")).toBe(false);

    expect(
      generateSyncBotReply("¿Cómo funciona el cursor?", "sandbox", "Leo"),
    ).toContain("cursor");
    expect(
      generateSyncBotReply("¿Qué pasa con el backoff?", "general", "Leo"),
    ).toContain("30000");

    const bundle = createDatabase(":memory:", { seed: true });
    const hub = new ChatHub({ db: bundle.db, botDelayMs: 25 });
    const sock = new MockSocket();

    try {
      hub.registerSocket(sock);
      await hub.handleRawMessage(
        sock,
        JSON.stringify({
          type: "room:join",
          roomSlug: "sandbox",
          clientId: "u-bot",
          alias: "Leo",
        }),
      );
      sock.sent = [];

      await hub.handleRawMessage(
        sock,
        JSON.stringify({
          type: "message:send",
          roomSlug: "sandbox",
          clientTempId: "tmp-bot-1",
          senderId: "u-bot",
          senderName: "Leo",
          content: "Hola @SyncBot, explica la latencia",
        }),
      );

      // Should immediately broadcast typing:update with SyncBot
      const typingEvents = sock
        .parsedEvents()
        .filter((e) => e.type === "typing:update");
      expect(
        typingEvents.some(
          (e) =>
            e.type === "typing:update" &&
            e.typingUsers.some((u) => u.clientId === "syncbot"),
        ),
      ).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 60));

      const botMsgEvent = sock
        .parsedEvents()
        .find(
          (e) => e.type === "message:new" && e.message.senderId === "syncbot",
        );
      expect(botMsgEvent?.type).toBe("message:new");
      if (botMsgEvent?.type === "message:new") {
        expect(botMsgEvent.message.content.toLowerCase()).toContain("ws");
      }
    } finally {
      hub.shutdown();
      bundle.close();
    }
  });
});

describe("Environment, Health, OpenAPI & RFC 7807 Problem Details", () => {
  it("validates environment variables and honors SKIP_ENV_VALIDATION=true", () => {
    const defaults = parseEnv({});
    expect(defaults.PORT).toBe(3005);
    expect(defaults.DATABASE_URL).toBe("data/app.db");
    expect(defaults.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3005");

    expect(() => parseEnv({ PORT: "99999" })).toThrow(
      /Invalid environment configuration/,
    );
    expect(() => parseEnv({ POSTGRES_URL: "not-a-url" })).toThrow(
      /Invalid environment configuration/,
    );

    const skipped = parseEnv({
      SKIP_ENV_VALIDATION: "true",
      PORT: "not-a-number",
      POSTGRES_URL: "not-a-url",
    });
    expect(skipped.PORT).toBe(3005);
    expect(skipped.POSTGRES_URL).toBe("not-a-url");
  });

  it("exposes standardized /api/health response for pulsechat-rt with x-request-id", async () => {
    const req = new Request("http://localhost:3005/api/health", {
      headers: { "x-request-id": "req-health-1" },
    });
    const res = await getHealth(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("req-health-1");

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.service).toBe("pulsechat-rt");
    expect(body.status).toBe("ok");
    expect(HealthResponseSchema.safeParse(body).success).toBe(true);
  });

  it("exposes /api/openapi.json spec and /api/docs interactive HTML", async () => {
    const specRes = await getOpenApi(
      new Request("http://localhost:3005/api/openapi.json"),
    );
    expect(specRes.status).toBe(200);
    expect(specRes.headers.get("x-request-id")).toBeTruthy();

    const spec = (await specRes.json()) as {
      openapi: string;
      paths: Record<string, unknown>;
    };
    expect(spec.openapi).toBe("3.1.0");
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining([
        "/api/health",
        "/api/rooms",
        "/api/rooms/{slug}/messages",
      ]),
    );

    const docsRes = await getDocs(
      new Request("http://localhost:3005/api/docs"),
    );
    expect(docsRes.status).toBe(200);
    expect(docsRes.headers.get("content-type")).toContain("text/html");
    expect(docsRes.headers.get("x-request-id")).toBeTruthy();
    const html = await docsRes.text();
    expect(html).toContain("PulseChat RT API");
    expect(html).toContain("/api/openapi.json");
  });

  it("returns RFC 7807 Problem Details with x-request-id on API validation and lookup errors", async () => {
    const badJsonReq = new Request("http://localhost:3005/api/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": "req-bad-json",
      },
      body: "{invalid",
    });
    const badJsonRes = await postRoom(badJsonReq);
    expect(badJsonRes.status).toBe(400);
    expect(badJsonRes.headers.get("content-type")).toContain(
      "application/problem+json",
    );
    expect(badJsonRes.headers.get("x-request-id")).toBe("req-bad-json");
    const badJsonBody = (await badJsonRes.json()) as Record<string, unknown>;
    expect(ProblemDetailsSchema.safeParse(badJsonBody).success).toBe(true);
    expect(badJsonBody.requestId).toBe("req-bad-json");

    const invalidPayloadReq = new Request("http://localhost:3005/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    const invalidPayloadRes = await postRoom(invalidPayloadReq);
    expect(invalidPayloadRes.status).toBe(400);
    expect(invalidPayloadRes.headers.get("content-type")).toContain(
      "application/problem+json",
    );
    expect(invalidPayloadRes.headers.get("x-request-id")).toBeTruthy();

    const notFoundRes = await getRoomMessagesRoute(
      new Request("http://localhost:3005/api/rooms/missing-room/messages", {
        headers: { "x-request-id": "req-404" },
      }),
      { params: Promise.resolve({ slug: "missing-room" }) },
    );
    expect(notFoundRes.status).toBe(404);
    expect(notFoundRes.headers.get("content-type")).toContain(
      "application/problem+json",
    );
    expect(notFoundRes.headers.get("x-request-id")).toBe("req-404");

    const badCursorRes = await getRoomMessagesRoute(
      new Request(
        "http://localhost:3005/api/rooms/sandbox/messages?cursor=bad_cursor",
        {
          headers: { "x-request-id": "req-bad-cursor" },
        },
      ),
      { params: Promise.resolve({ slug: "sandbox" }) },
    );
    expect(badCursorRes.status).toBe(400);
    expect(badCursorRes.headers.get("content-type")).toContain(
      "application/problem+json",
    );
    expect(badCursorRes.headers.get("x-request-id")).toBe("req-bad-cursor");
  });
});

describe("i18n Dictionary Parity", () => {
  it("keeps identical keys and non-empty values between es and en locales", () => {
    const esKeys = Object.keys(TRANSLATIONS.es).sort();
    const enKeys = Object.keys(TRANSLATIONS.en).sort();
    expect(esKeys).toEqual(enKeys);
    expect(esKeys.length).toBeGreaterThan(20);

    for (const key of esKeys) {
      const k = key as keyof typeof TRANSLATIONS.es;
      expect(TRANSLATIONS.es[k].trim().length).toBeGreaterThan(0);
      expect(TRANSLATIONS.en[k].trim().length).toBeGreaterThan(0);
    }

    expect(TRANSLATIONS.es.enterGuestSandbox).toBe(
      "Entrar como Invitado a Sala Sandbox",
    );
  });
});
