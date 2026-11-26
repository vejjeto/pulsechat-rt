"use client";

import type { ConnectionStatus } from "@/hooks/use-sync-chat";
import { type TranslationKey, useLocale } from "@/lib/i18n";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";

interface ConnectionBadgeProps {
  status: ConnectionStatus;
  latencyMs: number | null;
  reconnectAttempt: number;
  nextRetryMs: number | null;
  onSimulateDisconnect: () => void;
  onReconnect: () => void;
  compact?: boolean;
}

const STATUS_STYLE: Record<
  ConnectionStatus,
  { dot: string; badge: string; labelKey: TranslationKey }
> = {
  connected: {
    dot: "bg-emerald-400",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    labelKey: "connected",
  },
  reconnecting: {
    dot: "bg-amber-400 animate-pulse",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    labelKey: "reconnecting",
  },
  disconnected: {
    dot: "bg-rose-500",
    badge: "border-rose-500/30 bg-rose-500/10 text-rose-300",
    labelKey: "disconnected",
  },
};

export function ConnectionBadge({
  status,
  latencyMs,
  reconnectAttempt,
  nextRetryMs,
  onSimulateDisconnect,
  onReconnect,
  compact = false,
}: ConnectionBadgeProps) {
  const { t } = useLocale();
  const style = STATUS_STYLE[status];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        data-testid="connection-status-pill"
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs ${style.badge}`}
      >
        <span className={`h-2 w-2 rounded-full ${style.dot}`} />
        <span>{t[style.labelKey]}</span>
        {status === "connected" && latencyMs !== null && !compact && (
          <span className="text-emerald-400/80">· {latencyMs}ms</span>
        )}
        {status === "reconnecting" && reconnectAttempt > 0 && !compact && (
          <span className="text-amber-300/80">
            · #{reconnectAttempt}
            {nextRetryMs ? ` (${Math.round(nextRetryMs / 100) / 10}s)` : ""}
          </span>
        )}
      </div>

      {status === "connected" ? (
        <button
          type="button"
          onClick={onSimulateDisconnect}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 font-mono text-xs text-zinc-300 transition hover:border-rose-500/50 hover:text-rose-300"
        >
          <WifiOff className="h-3.5 w-3.5" />
          <span>{compact ? t.disconnectShort : t.simulateDisconnect}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onReconnect}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 font-mono text-xs text-emerald-300 transition hover:bg-emerald-500/25"
        >
          {status === "reconnecting" ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wifi className="h-3.5 w-3.5" />
          )}
          <span>{t.reconnect}</span>
        </button>
      )}
    </div>
  );
}
