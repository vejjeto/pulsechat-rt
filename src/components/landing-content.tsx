"use client";

import { GuestEntryCard } from "@/components/guest-entry-card";
import { HealthBadge } from "@/components/health-badge";
import { LanguageToggle } from "@/components/language-toggle";
import { type TranslationKey, useLocale } from "@/lib/i18n";
import { Activity, Database, Radio, ShieldCheck, Zap } from "lucide-react";
import Link from "next/link";

const HIGHLIGHTS: ReadonlyArray<{
  icon: typeof Radio;
  titleKey: TranslationKey;
  detailKey: TranslationKey;
}> = [
  {
    icon: Radio,
    titleKey: "highlight1Title",
    detailKey: "highlight1Detail",
  },
  {
    icon: Database,
    titleKey: "highlight2Title",
    detailKey: "highlight2Detail",
  },
  {
    icon: ShieldCheck,
    titleKey: "highlight3Title",
    detailKey: "highlight3Detail",
  },
  {
    icon: Activity,
    titleKey: "highlight4Title",
    detailKey: "highlight4Detail",
  },
];

export function LandingContent() {
  const { t } = useLocale();

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
            <LanguageToggle />
            <Link
              href="/chat?room=sandbox"
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 font-mono text-xs text-zinc-200 transition hover:border-emerald-500/60 hover:text-emerald-300"
            >
              {t.openChatLink}
            </Link>
          </div>
        </header>

        <section className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-mono text-xs text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>{t.heroBadge}</span>
          </div>

          <h2 className="max-w-3xl text-3xl font-bold tracking-tight text-zinc-50 sm:text-5xl">
            {t.heroTitle}
          </h2>
          <p className="max-w-2xl text-base text-zinc-400 sm:text-lg">
            {t.heroSubtitle}
          </p>
        </section>

        <GuestEntryCard />

        <section className="grid gap-4 sm:grid-cols-2">
          {HIGHLIGHTS.map((item) => {
            const Icon = item.icon;
            return (
              <article
                key={item.titleKey}
                className="rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-5"
              >
                <div className="mb-2 flex items-center gap-2.5 text-sm font-semibold text-zinc-100">
                  <Icon className="h-4 w-4 text-emerald-400" />
                  <h3>{t[item.titleKey]}</h3>
                </div>
                <p className="text-sm leading-relaxed text-zinc-400">
                  {t[item.detailKey]}
                </p>
              </article>
            );
          })}
        </section>
      </div>

      <footer className="relative mx-auto mt-12 w-full max-w-5xl border-t border-zinc-800/80 pt-5 text-xs text-zinc-500">
        <div className="flex flex-wrap items-center justify-between gap-2 font-mono">
          <span>{t.footerTagline}</span>
          <span>{t.footerSeedNote}</span>
        </div>
      </footer>
    </main>
  );
}
