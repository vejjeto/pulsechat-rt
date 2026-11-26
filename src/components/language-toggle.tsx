"use client";

import { useLocale } from "@/lib/i18n";
import { Globe } from "lucide-react";

export function LanguageToggle() {
  const { locale, toggleLocale } = useLocale();

  return (
    <button
      type="button"
      onClick={toggleLocale}
      aria-label="Cambiar idioma (ES/EN)"
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-xs text-zinc-200 transition hover:border-emerald-500/60 hover:text-emerald-300"
    >
      <Globe className="h-3.5 w-3.5 text-emerald-400" />
      <span>{locale === "es" ? "ES" : "EN"}</span>
    </button>
  );
}
