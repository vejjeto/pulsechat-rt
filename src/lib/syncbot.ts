interface BotRule {
  keywords: string[];
  reply: (senderName: string, roomSlug: string) => string;
}

const BOT_RULES: BotRule[] = [
  {
    keywords: [
      "latencia",
      "latency",
      "ping",
      "ms",
      "rapido",
      "rápido",
      "ws",
      "websocket",
    ],
    reply: (_sender, roomSlug) =>
      `En #${roomSlug}, el servidor unificado (Next.js + ws en /ws) responde ping/pong y message:ack en pocos milisegundos sin hops HTTP intermedios.`,
  },
  {
    keywords: [
      "cursor",
      "paginacion",
      "paginación",
      "scroll",
      "historial",
      "offset",
    ],
    reply: () =>
      "La paginación usa cursor compuesto (createdAt, id) indexado en SQLite. Así el scroll hacia arriba nunca duplica ni salta mensajes aunque entren nuevos eventos en vivo.",
  },
  {
    keywords: [
      "backoff",
      "recone",
      "descone",
      "offline",
      "retry",
      "jitter",
      "caida",
      "caída",
    ],
    reply: () =>
      "La reconexión automática aplica Exponential Backoff: min(1000 * 2^attempt, 30000) + jitter aleatorio. Puedes probarlo con el botón 'Simular desconexión'.",
  },
  {
    keywords: ["ack", "duplicado", "idempoten", "optimista", "tempid"],
    reply: () =>
      "Cada envío genera un clientTempId en el cliente (estado 'sending'). Cuando SQLite confirma el INSERT, el hub emite message:ack y la UI lo marca como 'sent' (✓) deduplicando message:new.",
  },
  {
    keywords: [
      "hola",
      "hello",
      "hi",
      "buenas",
      "hey",
      "saludos",
      "test",
      "prueba",
    ],
    reply: (sender, roomSlug) =>
      `¡Hola ${sender}! Soy @SyncBot en #${roomSlug}. Pregúntame sobre latencia WebSocket, paginación por cursor, backoff exponencial o prueba abrir una segunda pestaña.`,
  },
];

export function shouldSyncBotRespond(
  roomSlug: string,
  senderId: string,
): boolean {
  if (senderId === "syncbot") {
    return false;
  }
  return roomSlug === "sandbox" || roomSlug === "general";
}

export function generateSyncBotReply(
  content: string,
  roomSlug: string,
  senderName: string,
): string {
  const normalized = content.toLowerCase();
  for (const rule of BOT_RULES) {
    if (rule.keywords.some((kw) => normalized.includes(kw))) {
      return rule.reply(senderName, roomSlug);
    }
  }
  return `Recibido en #${roomSlug}, ${senderName}. Mensaje persistido vía Drizzle/SQLite y confirmado por message:ack. Prueba consultar sobre 'cursor', 'latencia', 'backoff' o 'ack'.`;
}
