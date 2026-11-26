"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

interface HealthPayload {
  status: "ok" | "degraded";
  checks?: {
    database?: {
      status: "up" | "down";
      latencyMs: number;
    };
  };
}

export function HealthBadge() {
  const { data, isError, isLoading } = useQuery<HealthPayload>({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Health check failed");
      }
      return (await res.json()) as HealthPayload;
    },
    refetchInterval: 30_000,
    retry: 1,
  });

  const isHealthy = !isError && data?.status === "ok";
  const latency = data?.checks?.database?.latencyMs;

  const dotClass = isLoading
    ? "bg-zinc-400"
    : isHealthy
      ? "bg-emerald-400"
      : "bg-rose-400";

  const pillClass = isLoading
    ? "border-zinc-700 bg-zinc-900 text-zinc-400"
    : isHealthy
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : "border-rose-500/30 bg-rose-500/10 text-rose-300";

  const label = isLoading
    ? "health..."
    : isHealthy
      ? latency !== undefined
        ? `ok · ${latency}ms`
        : "ok"
      : "degraded";

  return (
    <Link
      href="/api/docs"
      title="Ver estado de salud y OpenAPI"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition hover:opacity-85 ${pillClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      <span>{label}</span>
    </Link>
  );
}
