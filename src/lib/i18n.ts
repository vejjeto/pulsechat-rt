"use client";

import { useCallback, useEffect, useState } from "react";

export type Locale = "es" | "en";

const STORAGE_KEY = "pulsechat-lang";
const CHANGE_EVENT = "pulsechat-lang-change";

const ES_MESSAGES = {
  openChatLink: "Abrir /chat →",
  openDemo: "Abrir Demo",
  heroBadge: "Puerto 3005 · @SyncBot activo en #sandbox y #general",
  heroTitle:
    "Mensajería en tiempo real con persistencia determinista y resiliencia de red.",
  heroSubtitle:
    "Prueba en 5 segundos envío optimista con ACK, paginación hacia atrás por cursor compuesto, presencia viva entre pestañas y simulación de desconexión con backoff exponencial.",
  guestCardHeader:
    "Demo Zero-Friction · Identidad por pestaña (sessionStorage)",
  guestCardBadge: "Sin registro",
  guestAliasLabel: "Tu alias de invitado en esta pestaña",
  regenerateAliasTitle: "Generar otro alias",
  initialRoomAria: "Sala inicial",
  enterGuestSandbox: "Entrar como Invitado a Sala Sandbox",
  goToGeneral: "Ir a #general",
  highlight1Title: "Servidor Unificado Next.js + ws",
  highlight1Detail:
    "Upgrade selectivo en /ws preservando /_next/webpack-hmr, con heartbeat cada 30s que poda sockets muertos de presence:update.",
  highlight2Title: "Cursor Pagination Determinista",
  highlight2Detail:
    "Índice compuesto (room_id, created_at, id) en SQLite WAL. Sin saltos ni duplicados al cargar historial hacia arriba.",
  highlight3Title: "Contratos Zod + ACK Optimista",
  highlight3Detail:
    "Eventos tipados client/server con clientTempId para pasar de 'sending' a 'sent' (✓) e idempotencia ante reintentos.",
  highlight4Title: "Exponential Backoff + Jitter",
  highlight4Detail:
    "Reconexión progresiva min(1000 * 2^attempt, 30000) + jitter y botón manual para simular caídas de red en vivo.",
  footerTagline: "SyncChat RT · Next.js 15 App Router + ws + node:sqlite",
  footerSeedNote:
    "45 mensajes técnicos pre-sembrados para paginación por cursor",
  rooms: "Salas",
  publicRooms: "Salas públicas",
  newRoomPlaceholder: "Nueva sala (ej. qa)",
  createRoomTitle: "Crear sala",
  yourAlias: "Tu alias (sessionStorage)",
  online: "En línea",
  presenceIn: "Presencia en",
  you: "tú",
  initializingWs: "Inicializando sesión WS...",
  openMirrorView: "Abrir vista espejo",
  openSecondTab: "Abrir vista espejo / segunda pestaña",
  splitView: "Vista dividida (2 clientes)",
  closeSplitView: "Cerrar vista dividida",
  openRoomsMenu: "Abrir menú de salas",
  closeRoomsMenu: "Cerrar menú de salas",
  clientA: "Cliente A",
  clientBMirror: "Cliente B (Espejo)",
  connected: "Conectado",
  reconnecting: "Reconectando...",
  disconnected: "Sin conexión",
  simulateDisconnect: "Simular desconexión",
  disconnectShort: "Desconectar",
  reconnect: "Reconectar",
  loadOlder: "Cargar mensajes anteriores",
  loadingOlder: "Cargando historial...",
  loadingMessages: "Cargando mensajes de",
  noMessagesPrefix: "No hay mensajes en",
  noMessagesSuffix: "todavía. Envía el primero para probar el flujo WS.",
  messagePlaceholderPrefix: "Escribe en",
  messagePlaceholderAs: "como",
  send: "Enviar",
  typingSingular: "está escribiendo...",
  typingPlural: "están escribiendo...",
  sendingTitle: "Enviando...",
  failed: "falló",
  confirmedTitle: "Confirmado (message:ack)",
} as const;

export type TranslationKey = keyof typeof ES_MESSAGES;

const EN_MESSAGES: Record<TranslationKey, string> = {
  openChatLink: "Open /chat →",
  openDemo: "Open Demo",
  heroBadge: "Port 3005 · @SyncBot active in #sandbox and #general",
  heroTitle:
    "Real-time messaging with deterministic persistence and network resilience.",
  heroSubtitle:
    "Try optimistic ACK delivery, compound cursor backward pagination, live cross-tab presence, and exponential backoff disconnect simulation in 5 seconds.",
  guestCardHeader: "Zero-Friction Demo · Per-tab identity (sessionStorage)",
  guestCardBadge: "No signup",
  guestAliasLabel: "Your guest alias in this tab",
  regenerateAliasTitle: "Generate another alias",
  initialRoomAria: "Initial room",
  enterGuestSandbox: "Enter Sandbox Room as Guest",
  goToGeneral: "Go to #general",
  highlight1Title: "Unified Next.js + ws Server",
  highlight1Detail:
    "Selective upgrade on /ws preserving /_next/webpack-hmr, with a 30s heartbeat pruning dead sockets from presence:update.",
  highlight2Title: "Deterministic Cursor Pagination",
  highlight2Detail:
    "Composite index (room_id, created_at, id) on SQLite WAL. Zero skips or duplicates when loading older history.",
  highlight3Title: "Zod Contracts + Optimistic ACK",
  highlight3Detail:
    "Typed client/server events with clientTempId to transition from 'sending' to 'sent' (✓) and retry idempotency.",
  highlight4Title: "Exponential Backoff + Jitter",
  highlight4Detail:
    "Progressive reconnection min(1000 * 2^attempt, 30000) + jitter and manual button to simulate live network drops.",
  footerTagline: "SyncChat RT · Next.js 15 App Router + ws + node:sqlite",
  footerSeedNote: "45 pre-seeded technical messages for cursor pagination",
  rooms: "Rooms",
  publicRooms: "Public rooms",
  newRoomPlaceholder: "New room (e.g. qa)",
  createRoomTitle: "Create room",
  yourAlias: "Your alias (sessionStorage)",
  online: "Online",
  presenceIn: "Presence in",
  you: "you",
  initializingWs: "Initializing WS session...",
  openMirrorView: "Open mirror view",
  openSecondTab: "Open mirror view / second tab",
  splitView: "Split view (2 clients)",
  closeSplitView: "Close split view",
  openRoomsMenu: "Open rooms menu",
  closeRoomsMenu: "Close rooms menu",
  clientA: "Client A",
  clientBMirror: "Client B (Mirror)",
  connected: "Connected",
  reconnecting: "Reconnecting...",
  disconnected: "Disconnected",
  simulateDisconnect: "Simulate disconnect",
  disconnectShort: "Disconnect",
  reconnect: "Reconnect",
  loadOlder: "Load older messages",
  loadingOlder: "Loading history...",
  loadingMessages: "Loading messages for",
  noMessagesPrefix: "No messages in",
  noMessagesSuffix: "yet. Send the first one to test the WS flow.",
  messagePlaceholderPrefix: "Write in",
  messagePlaceholderAs: "as",
  send: "Send",
  typingSingular: "is typing...",
  typingPlural: "are typing...",
  sendingTitle: "Sending...",
  failed: "failed",
  confirmedTitle: "Confirmed (message:ack)",
};

export const TRANSLATIONS: Record<Locale, Record<TranslationKey, string>> = {
  es: ES_MESSAGES,
  en: EN_MESSAGES,
};

function isLocale(value: string | null): value is Locale {
  return value === "es" || value === "en";
}

export function useLocale() {
  const [locale, setLocaleState] = useState<Locale>("es");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) {
      setLocaleState(stored);
      document.documentElement.lang = stored;
    }

    const handleChange = (event: Event) => {
      const detail =
        event instanceof CustomEvent ? (event.detail as unknown) : null;
      if (typeof detail === "string" && isLocale(detail)) {
        setLocaleState(detail);
        return;
      }
      const next = localStorage.getItem(STORAGE_KEY);
      if (isLocale(next)) {
        setLocaleState(next);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && isLocale(event.newValue)) {
        setLocaleState(event.newValue);
        document.documentElement.lang = event.newValue;
      }
    };

    window.addEventListener(CHANGE_EVENT, handleChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handleChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
    setLocaleState(next);
    window.dispatchEvent(
      new CustomEvent<Locale>(CHANGE_EVENT, { detail: next }),
    );
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === "es" ? "en" : "es");
  }, [locale, setLocale]);

  return {
    locale,
    setLocale,
    toggleLocale,
    t: TRANSLATIONS[locale],
  };
}
