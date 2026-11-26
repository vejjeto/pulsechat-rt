import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { type SqliteRemoteDatabase, drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";

export type AppDatabase = SqliteRemoteDatabase<typeof schema>;

export interface DatabaseBundle {
  db: AppDatabase;
  sqlite: DatabaseSync;
  close: () => void;
}

const SCHEMA_SQL = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_public INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY NOT NULL,
    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    sender_name TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_room_cursor
    ON messages (room_id, created_at, id);
`;

export function resolveDatabaseLocation(overrideUrl?: string): string {
  const raw = (overrideUrl ?? process.env.DATABASE_URL ?? "").trim();
  if (!raw) {
    return path.resolve(process.cwd(), "data/app.db");
  }
  if (raw === ":memory:" || raw.startsWith("file::memory:")) {
    return ":memory:";
  }
  const normalized = raw.startsWith("file:") ? raw.slice(5) : raw;
  return path.isAbsolute(normalized)
    ? normalized
    : path.resolve(process.cwd(), normalized);
}

export function applySchema(sqlite: DatabaseSync): void {
  sqlite.exec(SCHEMA_SQL);
}

function createProxyRunner(sqlite: DatabaseSync) {
  return async (
    sql: string,
    params: unknown[],
    method: "run" | "all" | "values" | "get",
  ): Promise<{ rows: unknown[] }> => {
    const stmt = sqlite.prepare(sql);
    const bound = params as SQLInputValue[];

    if (method === "run") {
      stmt.run(...bound);
      return { rows: [] };
    }

    stmt.setReturnArrays(true);
    if (method === "get") {
      const row = stmt.get(...bound);
      return { rows: (row ?? undefined) as unknown as unknown[] };
    }

    const rows = stmt.all(...bound);
    return { rows: rows as unknown as unknown[][] };
  };
}

export function createDatabase(
  overrideUrl?: string,
  options?: { seed?: boolean },
): DatabaseBundle {
  const location = resolveDatabaseLocation(overrideUrl);
  if (location !== ":memory:") {
    fs.mkdirSync(path.dirname(location), { recursive: true });
  }

  const sqlite = new DatabaseSync(location);
  if (location !== ":memory:") {
    sqlite.exec("PRAGMA journal_mode = WAL;");
  }
  applySchema(sqlite);

  const db = drizzle(createProxyRunner(sqlite), { schema });
  const bundle: DatabaseBundle = {
    db,
    sqlite,
    close: () => sqlite.close(),
  };

  if (options?.seed) {
    ensureDemoData(sqlite);
  }

  return bundle;
}

export interface SeedRoomInput {
  id: string;
  slug: string;
  name: string;
  description: string;
  isPublic: boolean;
  createdAt: number;
}

export interface SeedMessageInput {
  id: string;
  roomId: string;
  senderName: string;
  senderId: string;
  content: string;
  createdAt: number;
}

const BASE_TIME = Date.UTC(2025, 1, 10, 14, 0, 0);

export const DEMO_ROOMS: SeedRoomInput[] = [
  {
    id: "room-sandbox",
    slug: "sandbox",
    name: "#sandbox — Sala Demo",
    description:
      "Sala interactiva para probar latencia WS, ack optimista, cursor pagination y respuestas de @SyncBot.",
    isPublic: true,
    createdAt: BASE_TIME,
  },
  {
    id: "room-general",
    slug: "general",
    name: "#general — Ingeniería",
    description:
      "Discusión técnica sobre WebSockets, SQLite WAL, backoff exponencial y resiliencia en tiempo real.",
    isPublic: true,
    createdAt: BASE_TIME + 1_000,
  },
  {
    id: "room-arquitectura",
    slug: "arquitectura",
    name: "#arquitectura — Sistemas",
    description:
      "Decisiones de arquitectura (ADRs), contratos Zod compartidos e idempotencia con clientTempId.",
    isPublic: true,
    createdAt: BASE_TIME + 2_000,
  },
];

const SANDBOX_AUTHORS: Array<{ id: string; name: string }> = [
  { id: "syncbot", name: "SyncBot" },
  { id: "eng-elena", name: "Elena · Staff Eng" },
  { id: "eng-mateo", name: "Mateo · Backend" },
  { id: "eng-sofia", name: "Sofía · Frontend" },
];

const SANDBOX_LINES: string[] = [
  "Bienvenidos a #sandbox. Esta sala viene precargada con historial ordenado para validar paginación por cursor.",
  "Acabamos de unificar el servidor HTTP de Next.js 15 con ws usando WebSocketServer({ noServer: true }).",
  "Clave del upgrade: solo interceptamos /ws y delegamos /_next/webpack-hmr al handler nativo de Next.",
  "¿Cómo validan los payloads entrantes? Con Zod discriminatedUnion compartido en src/shared/ws-contract.ts.",
  "Sí, cada frame inválido devuelve un error:event estructurado sin tumbar la conexión.",
  "Para evitar duplicados en reconexiones o envíos rápidos, cada message:send incluye un clientTempId UUID.",
  "Cuando SQLite confirma el INSERT, el hub devuelve message:ack al emisor y message:new al resto de la sala.",
  "En la UI el mensaje pasa de estado 'sending' a 'sent' (✓) en <5ms locales.",
  "Probad subir el scroll hacia arriba: al llegar al tope dispara GET /api/rooms/sandbox/messages?cursor=...",
  "¿Por qué cursor compuesto (createdAt, id) y no OFFSET? Porque OFFSET salta o duplica filas si llegan mensajes en vivo.",
  "Exacto: con el índice idx_messages_room_cursor en (room_id, created_at, id) la consulta es O(log N).",
  "Además el cursor es estable aunque se inserten 20 mensajes nuevos mientras lees el historial antiguo.",
  "El heartbeat del hub envía pings cada 30s y poda sockets muertos de presence:update automáticamente.",
  "Si cierras una pestaña bruscamente, el resto de clientes ve desaparecer ese alias en el roster de presencia.",
  "¿Y si cae el Wi-Fi del cliente? El hook usa backoff exponencial: min(1000 * 2^attempt, 30000) + jitter.",
  "El jitter aleatorio evita el efecto thundering herd cuando miles de clientes reconectan a la vez.",
  "Puedes simular una caída desde el botón 'Simular desconexión' en la barra superior.",
  "Mientras está desconectado, el indicador cambia a rojo ('Sin conexión') o ámbar ('Reconectando...').",
  "Cada pestaña guarda su alias de invitado en sessionStorage para probar multi-cliente sin login.",
  "Prueba abrir 'Abrir vista espejo / segunda pestaña' para ver mensajería y typing en vivo entre dos clientes.",
  "También incluimos vista dividida inline si prefieres probar dos clientes lado a lado en la misma pantalla.",
  "En esta sala y en #general, @SyncBot escucha cada mensaje y simula typing durante ~900ms antes de responder.",
  "SQLite corre con node:sqlite nativo (DatabaseSync) y Drizzle sqlite-proxy sin binarios C++ externos.",
  "El esquema también incluye schema.pg.ts y docker-compose.yml para migrar a PostgreSQL sin fricción.",
  "¡Listo! Escribe cualquier pregunta sobre latencia, cursor o backoff y @SyncBot responderá al instante.",
];

const GENERAL_LINES: string[] = [
  "SyncChat RT iniciado en modo desarrollo unificado (puerto 3005).",
  "Revisión de latencia: el round-trip local de message:send -> message:ack promedia ~2ms con SQLite WAL.",
  "Recordatorio: mantener complejidad ciclomática <= 10 y tipado estricto sin any en todos los módulos.",
  "El índice compuesto (room_id, created_at, id) cubre las lecturas de historial en orden descendente.",
  "En el API REST devolvemos items en orden cronológico ascendente para renderizar natural de arriba a abajo.",
  "nextCursor apunta siempre al primer elemento (más antiguo) de la página actual cuando hasMore === true.",
  "¿Alguien validó el comportamiento cuando dos mensajes comparten exactamente el mismo milisegundo?",
  "Sí, el desempate (created_at = cursor AND id < cursor_id) garantiza orden determinista sin saltos.",
  "Probado también con inserciones concurrentes durante la paginación hacia atrás.",
  "Para typing indicators usamos un TTL de seguridad en el servidor para limpiar estados colgados.",
  "Si el usuario deja de escribir o sale de la sala, typing:update se recalcula inmediatamente.",
  "La barra lateral colapsa a un drawer en viewports móviles de 375px manteniendo acceso a salas y presencia.",
  "El banner de estado de red permanece visible en todo momento para dar feedback claro al usuario.",
  "En tests unitarios inyectamos DatabaseSync(':memory:') para ejecutar la suite en pocos milisegundos.",
  "Los tests del hub usan sockets mock sin abrir puertos reales, evitando flakiness en CI.",
  "Verifica que el build de Next.js marque node:sqlite y ws como externos en next.config.mjs.",
  "Confirmado: next build compila limpio y server.ts arranca tanto dev como NODE_ENV=production.",
  "¿Qué sigue en la hoja de ruta? Métricas de throughput y compresión permessage-deflate opcional.",
  "Por ahora priorizamos simplicidad operativa: cero Redis obligatorio en local, un solo proceso Node.",
  "Cualquier duda técnica en #general también activa a @SyncBot para demostraciones rápidas.",
];

export function buildDemoMessages(): SeedMessageInput[] {
  const result: SeedMessageInput[] = [];

  SANDBOX_LINES.forEach((content, idx) => {
    const author = SANDBOX_AUTHORS[idx % SANDBOX_AUTHORS.length];
    if (!author) return;
    const num = String(idx + 1).padStart(2, "0");
    result.push({
      id: `msg-seed-sandbox-${num}`,
      roomId: "room-sandbox",
      senderId: author.id,
      senderName: author.name,
      content,
      createdAt: BASE_TIME + 10_000 + idx * 60_000,
    });
  });

  GENERAL_LINES.forEach((content, idx) => {
    const author = SANDBOX_AUTHORS[(idx + 1) % SANDBOX_AUTHORS.length];
    if (!author) return;
    const num = String(idx + 1).padStart(2, "0");
    result.push({
      id: `msg-seed-general-${num}`,
      roomId: "room-general",
      senderId: author.id,
      senderName: author.name,
      content,
      createdAt: BASE_TIME + 20_000 + idx * 60_000,
    });
  });

  return result;
}

export function ensureDemoData(sqlite: DatabaseSync): void {
  const insertRoom = sqlite.prepare(
    `INSERT OR IGNORE INTO rooms (id, slug, name, description, is_public, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const room of DEMO_ROOMS) {
    insertRoom.run(
      room.id,
      room.slug,
      room.name,
      room.description,
      room.isPublic ? 1 : 0,
      room.createdAt,
    );
  }

  const countStmt = sqlite.prepare("SELECT COUNT(*) as total FROM messages");
  const countRow = countStmt.get() as { total?: number } | undefined;
  if ((countRow?.total ?? 0) > 0) {
    return;
  }

  const insertMessage = sqlite.prepare(
    `INSERT OR IGNORE INTO messages (id, room_id, sender_name, sender_id, content, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const msg of buildDemoMessages()) {
    insertMessage.run(
      msg.id,
      msg.roomId,
      msg.senderName,
      msg.senderId,
      msg.content,
      msg.createdAt,
    );
  }
}

const globalForDb = globalThis as unknown as {
  __syncchatDbBundle?: DatabaseBundle | undefined;
};

export function getDb(): AppDatabase {
  if (!globalForDb.__syncchatDbBundle) {
    globalForDb.__syncchatDbBundle = createDatabase(undefined, { seed: true });
  }
  return globalForDb.__syncchatDbBundle.db;
}

export function closeGlobalDb(): void {
  if (globalForDb.__syncchatDbBundle) {
    globalForDb.__syncchatDbBundle.close();
    globalForDb.__syncchatDbBundle = undefined;
  }
}
