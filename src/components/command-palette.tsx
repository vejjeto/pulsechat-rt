"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  FileCode2,
  Hash,
  Home,
  Moon,
  Search,
  Sparkles,
  Sun,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

interface PaletteAction {
  id: string;
  label: string;
  hint: string;
  icon: typeof Home;
  run: () => void;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const actions = useMemo<PaletteAction[]>(() => {
    const go = (href: string) => {
      setOpen(false);
      setQuery("");
      router.push(href);
    };

    const toggleTheme = () => {
      const root = document.documentElement;
      const nextDark = !root.classList.contains("dark");
      root.classList.toggle("dark", nextDark);
      try {
        localStorage.setItem("theme", nextDark ? "dark" : "light");
      } catch {
        // Ignore storage errors in restricted contexts
      }
      setOpen(false);
    };

    return [
      {
        id: "home",
        label: "Ir a Inicio",
        hint: "/",
        icon: Home,
        run: () => go("/"),
      },
      {
        id: "demo",
        label: "Demo Sandbox (1 clic)",
        hint: "/demo",
        icon: Sparkles,
        run: () => go("/demo"),
      },
      {
        id: "room-sandbox",
        label: "Sala #sandbox",
        hint: "/chat?room=sandbox",
        icon: Hash,
        run: () => go("/chat?room=sandbox"),
      },
      {
        id: "room-general",
        label: "Sala #general",
        hint: "/chat?room=general",
        icon: Hash,
        run: () => go("/chat?room=general"),
      },
      {
        id: "room-arch",
        label: "Sala #arquitectura",
        hint: "/chat?room=arquitectura",
        icon: Hash,
        run: () => go("/chat?room=arquitectura"),
      },
      {
        id: "docs",
        label: "Documentación OpenAPI",
        hint: "/api/docs",
        icon: FileCode2,
        run: () => go("/api/docs"),
      },
      {
        id: "theme",
        label: "Alternar tema claro / oscuro",
        hint: "Tema",
        icon:
          typeof document !== "undefined" &&
          document.documentElement.classList.contains("dark")
            ? Sun
            : Moon,
        run: toggleTheme,
      },
    ];
  }, [router]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return actions;
    }
    return actions.filter(
      (a) =>
        a.label.toLowerCase().includes(q) || a.hint.toLowerCase().includes(q),
    );
  }, [actions, query]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-24 z-50 w-[92vw] max-w-lg -translate-x-1/2 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
          <Dialog.Title className="sr-only">Paleta de comandos</Dialog.Title>
          <div className="flex items-center gap-2.5 border-b border-zinc-800 px-3.5 py-3">
            <Search className="h-4 w-4 text-zinc-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar sala, ruta o acción... (Esc para cerrar)"
              className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 outline-none"
            />
            <kbd className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
              ESC
            </kbd>
          </div>
          <ul className="max-h-72 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center font-mono text-xs text-zinc-500">
                Sin coincidencias
              </li>
            ) : (
              filtered.map((action) => {
                const Icon = action.icon;
                return (
                  <li key={action.id}>
                    <button
                      type="button"
                      onClick={action.run}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm text-zinc-200 transition hover:bg-zinc-900"
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 text-emerald-400" />
                        <span>{action.label}</span>
                      </span>
                      <span className="font-mono text-xs text-zinc-500">
                        {action.hint}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
