"use client";

import { generateGuestAlias } from "@/lib/utils";
import { ArrowRight, RefreshCw, Sparkles, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const ALIAS_STORAGE_KEY = "syncchat:guest-alias";
const CLIENT_ID_STORAGE_KEY = "syncchat:client-id";

export function GuestEntryCard() {
  const router = useRouter();
  const [alias, setAlias] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("sandbox");

  useEffect(() => {
    const existingAlias = sessionStorage.getItem(ALIAS_STORAGE_KEY);
    const nextAlias = existingAlias?.trim()
      ? existingAlias
      : generateGuestAlias();
    sessionStorage.setItem(ALIAS_STORAGE_KEY, nextAlias);
    setAlias(nextAlias);

    if (!sessionStorage.getItem(CLIENT_ID_STORAGE_KEY)) {
      const id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `client-${Date.now()}`;
      sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, id);
    }
  }, []);

  const handleRegenerate = () => {
    const fresh = generateGuestAlias();
    setAlias(fresh);
    sessionStorage.setItem(ALIAS_STORAGE_KEY, fresh);
  };

  const handleEnter = (roomSlug: string) => {
    const finalAlias = alias.trim() || generateGuestAlias();
    sessionStorage.setItem(ALIAS_STORAGE_KEY, finalAlias);
    router.push(`/chat?room=${encodeURIComponent(roomSlug)}`);
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 shadow-2xl backdrop-blur">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-emerald-400">
          <Sparkles className="h-4 w-4" />
          <span>
            Demo Zero-Friction · Identidad por pestaña (sessionStorage)
          </span>
        </div>
        <span className="rounded-full border border-zinc-700 bg-zinc-800 px-2.5 py-0.5 font-mono text-xs text-zinc-300">
          Sin registro
        </span>
      </div>

      <label
        htmlFor="guest-alias-input"
        className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-400"
      >
        Tu alias de invitado en esta pestaña
      </label>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            id="guest-alias-input"
            type="text"
            maxLength={32}
            value={alias}
            onChange={(e) => {
              setAlias(e.target.value);
              sessionStorage.setItem(ALIAS_STORAGE_KEY, e.target.value);
            }}
            placeholder="Invitado-Delta-402"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 py-2.5 pl-10 pr-10 font-mono text-sm text-zinc-100 outline-none transition focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={handleRegenerate}
            title="Generar otro alias"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <select
          aria-label="Sala inicial"
          value={selectedRoom}
          onChange={(e) => setSelectedRoom(e.target.value)}
          className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 font-mono text-sm text-zinc-200 outline-none focus:border-emerald-500"
        >
          <option value="sandbox">#sandbox</option>
          <option value="general">#general</option>
          <option value="arquitectura">#arquitectura</option>
        </select>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => handleEnter(selectedRoom)}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 sm:flex-initial"
        >
          <span>Entrar como Invitado a Sala Sandbox</span>
          <ArrowRight className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => handleEnter("general")}
          className="inline-flex items-center justify-center rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900"
        >
          Ir a #general
        </button>
      </div>
    </div>
  );
}
