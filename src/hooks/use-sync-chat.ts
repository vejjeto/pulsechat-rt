"use client";

import { calculateBackoffDelay } from "@/lib/backoff";
import {
  type ChatMessageDTO,
  type ClientEvent,
  type PresenceMember,
  type ServerEvent,
  type TypingUser,
  parseServerEvent,
} from "@/shared/ws-contract";
import { type InfiniteData, useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

export interface UiMessage extends ChatMessageDTO {
  deliveryStatus?: "sending" | "sent" | "failed";
}

export interface UseSyncChatOptions {
  roomSlug: string;
  clientId: string;
  alias: string;
}

export interface UseSyncChatReturn {
  status: ConnectionStatus;
  reconnectAttempt: number;
  nextRetryMs: number | null;
  latencyMs: number | null;
  messages: UiMessage[];
  members: PresenceMember[];
  typingUsers: TypingUser[];
  hasMore: boolean;
  isLoadingInitial: boolean;
  isLoadingOlder: boolean;
  lastError: string | null;
  sendMessage: (content: string) => void;
  notifyTyping: (isTyping: boolean) => void;
  loadOlderMessages: () => Promise<number>;
  simulateDisconnect: () => void;
  reconnectNow: () => void;
}

interface CursorPageResponse {
  items: ChatMessageDTO[];
  nextCursor: string | null;
  hasMore: boolean;
}

function mergeUniqueMessages(
  existing: UiMessage[],
  incoming: UiMessage[],
): UiMessage[] {
  const map = new Map<string, UiMessage>();
  for (const item of existing) {
    map.set(item.id, item);
  }
  for (const item of incoming) {
    map.set(item.id, item);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.createdAt !== b.createdAt
      ? a.createdAt - b.createdAt
      : a.id.localeCompare(b.id),
  );
}

function buildWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

export function useSyncChat({
  roomSlug,
  clientId,
  alias,
}: UseSyncChatOptions): UseSyncChatReturn {
  const [status, setStatus] = useState<ConnectionStatus>("reconnecting");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [nextRetryMs, setNextRetryMs] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [liveMessages, setLiveMessages] = useState<UiMessage[]>([]);
  const [members, setMembers] = useState<PresenceMember[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const manualOfflineRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRoomRef = useRef(roomSlug);
  const aliasRef = useRef(alias);

  activeRoomRef.current = roomSlug;
  aliasRef.current = alias;

  const messagesQuery = useInfiniteQuery<
    CursorPageResponse,
    Error,
    InfiniteData<CursorPageResponse>,
    readonly [string, string],
    string | null
  >({
    queryKey: ["room-messages", roomSlug] as const,
    initialPageParam: null,
    enabled: Boolean(roomSlug),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams({ limit: "15" });
      if (pageParam) {
        qs.set("cursor", pageParam);
      }
      const res = await fetch(
        `/api/rooms/${encodeURIComponent(roomSlug)}/messages?${qs.toString()}`,
      );
      if (!res.ok) {
        throw new Error(
          pageParam
            ? "No se pudieron cargar mensajes anteriores"
            : "No se pudo cargar el historial de la sala",
        );
      }
      return (await res.json()) as CursorPageResponse;
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.nextCursor ? lastPage.nextCursor : undefined,
  });

  const historyMessages = useMemo<UiMessage[]>(() => {
    const pages = messagesQuery.data?.pages;
    if (!pages || pages.length === 0) {
      return [];
    }
    return [...pages].reverse().flatMap((page) =>
      page.items.map((item) => ({
        ...item,
        deliveryStatus: "sent" as const,
      })),
    );
  }, [messagesQuery.data]);

  const messages = useMemo(
    () => mergeUniqueMessages(historyMessages, liveMessages),
    [historyMessages, liveMessages],
  );

  const sendRawEvent = useCallback((event: ClientEvent): boolean => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    socket.send(JSON.stringify(event));
    return true;
  }, []);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  const handleServerEvent = useCallback(
    (event: ServerEvent) => {
      switch (event.type) {
        case "pong":
          setLatencyMs(Math.max(1, Date.now() - event.ts));
          return;
        case "room:joined":
          if (event.roomSlug === activeRoomRef.current) {
            setMembers(event.members);
          }
          return;
        case "presence:update":
          if (event.roomSlug === activeRoomRef.current) {
            setMembers(event.members);
          }
          return;
        case "typing:update":
          if (event.roomSlug === activeRoomRef.current) {
            setTypingUsers(
              event.typingUsers.filter((u) => u.clientId !== clientId),
            );
          }
          return;
        case "message:ack":
          if (event.roomSlug !== activeRoomRef.current) {
            return;
          }
          setLiveMessages((prev) =>
            prev.map((m) =>
              m.id === event.clientTempId ||
              m.clientTempId === event.clientTempId
                ? {
                    ...m,
                    id: event.messageId,
                    createdAt: event.createdAt,
                    deliveryStatus: "sent",
                  }
                : m,
            ),
          );
          return;
        case "message:new":
          if (event.message.roomSlug !== activeRoomRef.current) {
            return;
          }
          setLiveMessages((prev) => {
            const tempId = event.message.clientTempId;
            const filtered = tempId
              ? prev.filter((m) => m.id !== tempId && m.clientTempId !== tempId)
              : prev;
            return mergeUniqueMessages(filtered, [
              { ...event.message, deliveryStatus: "sent" },
            ]);
          });
          return;
        case "error:event":
          setLastError(event.message);
          return;
      }
    },
    [clientId],
  );

  const connectRef = useRef<() => void>(() => {});

  const scheduleReconnect = useCallback(() => {
    if (manualOfflineRef.current) {
      setStatus("disconnected");
      setNextRetryMs(null);
      return;
    }
    const attempt = attemptRef.current;
    const delay = calculateBackoffDelay(attempt);
    attemptRef.current = attempt + 1;
    setReconnectAttempt(attempt + 1);
    setNextRetryMs(delay);
    setStatus("reconnecting");

    reconnectTimerRef.current = setTimeout(() => {
      connectRef.current();
    }, delay);
  }, []);

  const connect = useCallback(() => {
    clearTimers();
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    if (!clientId || !aliasRef.current) {
      return;
    }

    setStatus("reconnecting");
    const socket = new WebSocket(buildWsUrl());
    wsRef.current = socket;

    socket.onopen = () => {
      attemptRef.current = 0;
      setReconnectAttempt(0);
      setNextRetryMs(null);
      setLastError(null);
      setStatus("connected");

      socket.send(
        JSON.stringify({
          type: "room:join",
          roomSlug: activeRoomRef.current,
          clientId,
          alias: aliasRef.current,
        } satisfies ClientEvent),
      );
      socket.send(
        JSON.stringify({ type: "ping", ts: Date.now() } satisfies ClientEvent),
      );

      pingIntervalRef.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: "ping",
              ts: Date.now(),
            } satisfies ClientEvent),
          );
        }
      }, 15_000);
    };

    socket.onmessage = (msgEvent) => {
      const raw = typeof msgEvent.data === "string" ? msgEvent.data : "";
      const parsed = parseServerEvent(raw);
      if (parsed.ok) {
        handleServerEvent(parsed.data);
      }
    };

    socket.onerror = () => {
      setLastError("Error en la conexión WebSocket");
    };

    socket.onclose = () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      wsRef.current = null;
      scheduleReconnect();
    };
  }, [clearTimers, clientId, handleServerEvent, scheduleReconnect]);

  connectRef.current = connect;

  // Initial WebSocket lifecycle
  useEffect(() => {
    if (!clientId || !alias) {
      return;
    }
    manualOfflineRef.current = false;
    connect();
    return () => {
      manualOfflineRef.current = true;
      clearTimers();
      if (typingStopTimerRef.current) {
        clearTimeout(typingStopTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [clientId, alias, clearTimers, connect]);

  // Reset live socket buffer and join room when switching roomSlug
  useEffect(() => {
    setLiveMessages([]);
    setMembers([]);
    setTypingUsers([]);
    setLastError(null);

    if (
      wsRef.current &&
      wsRef.current.readyState === WebSocket.OPEN &&
      clientId &&
      alias
    ) {
      sendRawEvent({
        type: "room:join",
        roomSlug,
        clientId,
        alias,
      });
    }
  }, [roomSlug, clientId, alias, sendRawEvent]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = messagesQuery;

  const loadOlderMessages = useCallback(async (): Promise<number> => {
    if (!hasNextPage || isFetchingNextPage) {
      return 0;
    }
    const result = await fetchNextPage();
    if (result.isError) {
      setLastError(
        result.error instanceof Error
          ? result.error.message
          : "Error en paginación",
      );
      return 0;
    }
    return result.data?.pages.at(-1)?.items.length ?? 0;
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const sendMessage = useCallback(
    (rawContent: string) => {
      const content = rawContent.trim();
      if (!content || !clientId || !alias) {
        return;
      }
      const clientTempId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? `temp-${crypto.randomUUID()}`
          : `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const optimistic: UiMessage = {
        id: clientTempId,
        clientTempId,
        roomId: roomSlug,
        roomSlug,
        senderId: clientId,
        senderName: alias,
        content,
        createdAt: Date.now(),
        deliveryStatus: "sending",
      };

      setLiveMessages((prev) => mergeUniqueMessages(prev, [optimistic]));

      const sent = sendRawEvent({
        type: "message:send",
        roomSlug,
        clientTempId,
        senderId: clientId,
        senderName: alias,
        content,
      });

      if (!sent) {
        setLiveMessages((prev) =>
          prev.map((m) =>
            m.id === clientTempId ? { ...m, deliveryStatus: "failed" } : m,
          ),
        );
        setLastError("Sin conexión WS activa. Reconecta para enviar.");
      }
    },
    [alias, clientId, roomSlug, sendRawEvent],
  );

  const notifyTyping = useCallback(
    (isTyping: boolean) => {
      if (!clientId || !alias) {
        return;
      }
      if (typingStopTimerRef.current) {
        clearTimeout(typingStopTimerRef.current);
        typingStopTimerRef.current = null;
      }

      if (isTyping) {
        sendRawEvent({ type: "typing:start", roomSlug, clientId, alias });
        typingStopTimerRef.current = setTimeout(() => {
          sendRawEvent({ type: "typing:stop", roomSlug, clientId });
        }, 2200);
      } else {
        sendRawEvent({ type: "typing:stop", roomSlug, clientId });
      }
    },
    [alias, clientId, roomSlug, sendRawEvent],
  );

  const simulateDisconnect = useCallback(() => {
    manualOfflineRef.current = true;
    clearTimers();
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus("disconnected");
    setNextRetryMs(null);
    setLatencyMs(null);
  }, [clearTimers]);

  const reconnectNow = useCallback(() => {
    manualOfflineRef.current = false;
    attemptRef.current = 0;
    setReconnectAttempt(0);
    connect();
  }, [connect]);

  const queryError =
    messagesQuery.error instanceof Error ? messagesQuery.error.message : null;

  return {
    status,
    reconnectAttempt,
    nextRetryMs,
    latencyMs,
    messages,
    members,
    typingUsers,
    hasMore: Boolean(messagesQuery.hasNextPage),
    isLoadingInitial: messagesQuery.isPending,
    isLoadingOlder: messagesQuery.isFetchingNextPage,
    lastError: lastError ?? queryError,
    sendMessage,
    notifyTyping,
    loadOlderMessages,
    simulateDisconnect,
    reconnectNow,
  };
}
