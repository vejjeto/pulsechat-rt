"use client";

import { type UiMessage, useSyncChat } from "@/hooks/use-sync-chat";
import { formatMessageTime } from "@/lib/utils";
import type { PresenceMember, TypingUser } from "@/shared/ws-contract";
import { ArrowUp, Bot, Check, Clock, Loader2, Send, Users } from "lucide-react";
import {
  type FormEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ConnectionBadge } from "./connection-badge";

interface ChatPanelProps {
  roomSlug: string;
  roomName: string;
  roomDescription?: string;
  clientId: string;
  alias: string;
  label?: string | undefined;
  compact?: boolean;
  onPresenceChange?: (members: PresenceMember[]) => void;
}

function formatTypingLabel(typingUsers: TypingUser[]): string | null {
  if (typingUsers.length === 0) {
    return null;
  }
  const first = typingUsers[0];
  if (typingUsers.length === 1 && first) {
    return `${first.alias} está escribiendo...`;
  }
  return `${typingUsers.map((u) => u.alias).join(", ")} están escribiendo...`;
}

function DeliveryIndicator({
  status,
}: { status?: UiMessage["deliveryStatus"] }) {
  if (status === "sending") {
    return (
      <span
        className="inline-flex items-center gap-1 text-zinc-400"
        title="Enviando..."
      >
        <Clock className="h-3 w-3" />
        <span>sending</span>
      </span>
    );
  }
  if (status === "failed") {
    return <span className="text-rose-400">falló</span>;
  }
  return (
    <span
      className="inline-flex items-center gap-0.5 text-emerald-400"
      title="Confirmado (message:ack)"
    >
      <Check className="h-3 w-3" />
      <span>sent</span>
    </span>
  );
}

export function ChatPanel({
  roomSlug,
  roomName,
  roomDescription,
  clientId,
  alias,
  label,
  compact = false,
  onPresenceChange,
}: ChatPanelProps) {
  const {
    status,
    reconnectAttempt,
    nextRetryMs,
    latencyMs,
    messages,
    members,
    typingUsers,
    hasMore,
    isLoadingInitial,
    isLoadingOlder,
    lastError,
    sendMessage,
    notifyTyping,
    loadOlderMessages,
    simulateDisconnect,
    reconnectNow,
  } = useSyncChat({ roomSlug, clientId, alias });

  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const restoreOffsetRef = useRef<number | null>(null);
  const shouldStickBottomRef = useRef(true);

  useEffect(() => {
    onPresenceChange?.(members);
  }, [members, onPresenceChange]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset scroll state when roomSlug changes
  useEffect(() => {
    shouldStickBottomRef.current = true;
    restoreOffsetRef.current = null;
  }, [roomSlug]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on messages update
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    if (restoreOffsetRef.current !== null) {
      el.scrollTop = Math.max(0, el.scrollHeight - restoreOffsetRef.current);
      restoreOffsetRef.current = null;
      return;
    }
    if (shouldStickBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const handleLoadOlder = async () => {
    const el = scrollRef.current;
    if (el) {
      restoreOffsetRef.current = el.scrollHeight - el.scrollTop;
      shouldStickBottomRef.current = false;
    }
    await loadOlderMessages();
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldStickBottomRef.current = distanceFromBottom < 96;

    if (el.scrollTop <= 20 && hasMore && !isLoadingOlder && !isLoadingInitial) {
      void handleLoadOlder();
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) {
      return;
    }
    shouldStickBottomRef.current = true;
    sendMessage(draft);
    notifyTyping(false);
    setDraft("");
  };

  const typingText = formatTypingLabel(typingUsers);

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-zinc-950">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/60 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-zinc-100 sm:text-base">
              {roomName}
            </h2>
            {label && (
              <span className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-mono text-[11px] text-cyan-300">
                {label} · {alias}
              </span>
            )}
          </div>
          {!compact && roomDescription && (
            <p className="truncate text-xs text-zinc-400">{roomDescription}</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {compact && (
            <span className="inline-flex items-center gap-1 font-mono text-xs text-zinc-400">
              <Users className="h-3.5 w-3.5" />
              {members.length}
            </span>
          )}
          <ConnectionBadge
            status={status}
            latencyMs={latencyMs}
            reconnectAttempt={reconnectAttempt}
            nextRetryMs={nextRetryMs}
            onSimulateDisconnect={simulateDisconnect}
            onReconnect={reconnectNow}
            compact={compact}
          />
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
      >
        {hasMore && (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              disabled={isLoadingOlder}
              onClick={() => void handleLoadOlder()}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-3.5 py-1.5 font-mono text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-50"
            >
              {isLoadingOlder ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowUp className="h-3.5 w-3.5" />
              )}
              <span>
                {isLoadingOlder
                  ? "Cargando historial..."
                  : "Cargar mensajes anteriores"}
              </span>
            </button>
          </div>
        )}

        {isLoadingInitial ? (
          <div className="flex items-center justify-center py-12 font-mono text-xs text-zinc-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Cargando mensajes de #{roomSlug}...
          </div>
        ) : messages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
            No hay mensajes en #{roomSlug} todavía. Envía el primero para probar
            el flujo WS.
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.senderId === clientId;
            const isBot = msg.senderId === "syncbot";
            return (
              <article
                key={msg.id}
                className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl border px-3.5 py-2.5 sm:max-w-[75%] ${
                    isOwn
                      ? "border-emerald-500/30 bg-emerald-500/10 text-zinc-100"
                      : isBot
                        ? "border-cyan-500/30 bg-cyan-950/30 text-zinc-100"
                        : "border-zinc-800 bg-zinc-900/80 text-zinc-200"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2 text-xs">
                    <span className="font-semibold text-zinc-200">
                      {msg.senderName}
                    </span>
                    {isBot && (
                      <span className="inline-flex items-center gap-1 rounded bg-cyan-500/20 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
                        <Bot className="h-3 w-3" />
                        @SyncBot
                      </span>
                    )}
                    <span className="font-mono text-[11px] text-zinc-500">
                      {formatMessageTime(msg.createdAt)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {msg.content}
                  </p>
                  {isOwn && (
                    <div className="mt-1 flex justify-end font-mono text-[10px]">
                      <DeliveryIndicator status={msg.deliveryStatus} />
                    </div>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      <div className="border-t border-zinc-800 bg-zinc-900/40 px-4 py-2.5">
        <div className="mb-1.5 flex min-h-[18px] items-center justify-between font-mono text-xs">
          <span className="text-amber-300/90">{typingText ?? ""}</span>
          {lastError && <span className="text-rose-400">{lastError}</span>}
        </div>

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            maxLength={2000}
            onChange={(e) => {
              setDraft(e.target.value);
              notifyTyping(e.target.value.trim().length > 0);
            }}
            placeholder={`Escribe en #${roomSlug} como ${alias}...`}
            className="flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Enviar</span>
          </button>
        </form>
      </div>
    </section>
  );
}
