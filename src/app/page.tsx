import { GuestEntryCard } from "@/components/guest-entry-card";
import { HealthBadge } from "@/components/health-badge";
import { Activity, Database, Radio, ShieldCheck, Zap } from "lucide-react";
import Link from "next/link";

const HIGHLIGHTS = [
  {
    icon: Radio,
    title: "Servidor Unificado Next.js + ws",
    detail:
      "Upgrade selectivo en /ws preservando /_next/webpack-hmr, con heartbeat cada 30s que poda sockets muertos de presence:update.",
  },
  {
    icon: Database,
    title: "Cursor Pagination Determinista",
    detail:
      "Índice compuesto (room_id, created_at, id) en SQLite WAL. Sin saltos ni duplicados al cargar historial hacia arriba.",
  },
  {
    icon: ShieldCheck,
    title: "Contratos Zod + ACK Optimista",
    detail:
      "Eventos tipados client/server con clientTempId para pasar de 'sending' a 'sent' (✓) e idempotencia ante reintentos.",
  },
  {
    icon: Activity,
    title: "Exponential Backoff + Jitter",
    detail:
      "Reconexión progresiva min(1000 * 2^attempt, 30000) + jitter y botón manual para simular caídas de red en vivo.",
  },
];

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col justify-between overflow-hidden bg-zinc-950 px-4 py-10 sm:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(16,185,129,0.12),_transparent_45%),radial-gradient(circle_at_bottom_left,_rgba(56,189,248,0.1),_transparent_45%)]" />

      <div className="relative mx-auto w-full max-w-5xl space-y-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-zinc-100">
                PulseChat RT
              </h1>
              <p className="font-mono text-xs text-zinc-400">
                WebSockets · Drizzle SQLite · Cursor Pagination
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <HealthBadge />
            <Link
              href="/chat?room=sandbox"
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 font-mono text-xs text-zinc-200 transition hover:border-emerald-500/60 hover:text-emerald-300"
            >
              Abrir /chat →
            </Link>
          </div>
        </header>

        <section className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-mono text-xs text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>Puerto 3005 · @SyncBot activo en #sandbox y #general</span>
          </div>

          <h2 className="max-w-3xl text-3xl font-bold tracking-tight text-zinc-50 sm:text-5xl">
            Mensajería en tiempo real con persistencia determinista y
            resiliencia de red.
          </h2>
          <p className="max-w-2xl text-base text-zinc-400 sm:text-lg">
            Prueba en 5 segundos envío optimista con ACK, paginación hacia atrás
            por cursor compuesto, presencia viva entre pestañas y simulación de
            desconexión con backoff exponencial.
          </p>
        </section>

        <GuestEntryCard />

        <section className="grid gap-4 sm:grid-cols-2">
          {HIGHLIGHTS.map((item) => {
            const Icon = item.icon;
            return (
              <article
                key={item.title}
                className="rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-5"
              >
                <div className="mb-2 flex items-center gap-2.5 text-sm font-semibold text-zinc-100">
                  <Icon className="h-4 w-4 text-emerald-400" />
                  <h3>{item.title}</h3>
                </div>
                <p className="text-sm leading-relaxed text-zinc-400">
                  {item.detail}
                </p>
              </article>
            );
          })}
        </section>
      </div>

      <footer className="relative mx-auto mt-12 w-full max-w-5xl border-t border-zinc-800/80 pt-5 text-xs text-zinc-500">
        <div className="flex flex-wrap items-center justify-between gap-2 font-mono">
          <span>SyncChat RT · Next.js 15 App Router + ws + node:sqlite</span>
          <span>
            45 mensajes técnicos pre-sembrados para paginación por cursor
          </span>
        </div>
      </footer>
    </main>
  );
}
