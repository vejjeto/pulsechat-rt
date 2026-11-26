"use client";

import { HealthBadge } from "@/components/health-badge";
import { LanguageToggle } from "@/components/language-toggle";
import { useToast } from "@/components/toast-provider";
import { useLocale } from "@/lib/i18n";
import { generateGuestAlias } from "@/lib/utils";
import type { PresenceMember, RoomDTO } from "@/shared/ws-contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Columns2,
  ExternalLink,
  Hash,
  Menu,
  Plus,
  Users,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ChatPanel } from "./chat-panel";

interface ChatWorkspaceProps {
  initialRooms: RoomDTO[];
  initialRoomSlug: string;
  initialGuest?: string | undefined;
}

const ALIAS_STORAGE_KEY = "syncchat:guest-alias";
const CLIENT_ID_STORAGE_KEY = "syncchat:client-id";

function createFallbackId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ChatWorkspace({
  initialRooms,
  initialRoomSlug,
  initialGuest,
}: ChatWorkspaceProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { t } = useLocale();
  const [activeSlug, setActiveSlug] = useState<string>(initialRoomSlug);
  const [clientId, setClientId] = useState("");
  const [alias, setAlias] = useState("");
  const [mirrorClientId, setMirrorClientId] = useState("");
  const [mirrorAlias, setMirrorAlias] = useState("");
  const [splitPreview, setSplitPreview] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [presenceMembers, setPresenceMembers] = useState<PresenceMember[]>([]);
  const [newRoomName, setNewRoomName] = useState("");
  const [roomError, setRoomError] = useState<string | null>(null);

  const { data: rooms = initialRooms } = useQuery<RoomDTO[]>({
    queryKey: ["rooms"],
    queryFn: async () => {
      const res = await fetch("/api/rooms");
      if (!res.ok) {
        throw new Error("No se pudieron cargar las salas");
      }
      const data = (await res.json()) as { rooms: RoomDTO[] };
      return data.rooms;
    },
    initialData: initialRooms,
  });

  const createRoomMutation = useMutation({
    mutationFn: async (trimmed: string) => {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed.startsWith("#") ? trimmed : `#${trimmed}`,
          slug: trimmed,
          description: "Sala creada en sesión en vivo.",
        }),
      });
      const data = (await res.json()) as {
        room?: RoomDTO;
        detail?: string;
        error?: string;
      };
      if (!res.ok || !data.room) {
        throw new Error(
          data.detail ?? data.error ?? "No se pudo crear la sala",
        );
      }
      return data.room;
    },
    onSuccess: (room) => {
      queryClient.setQueryData<RoomDTO[]>(["rooms"], (prev) =>
        prev
          ? prev.some((r) => r.id === room.id)
            ? prev
            : [...prev, room]
          : [room],
      );
      void queryClient.invalidateQueries({ queryKey: ["rooms"] });
      setActiveSlug(room.slug);
      setNewRoomName("");
      setDrawerOpen(false);
      setRoomError(null);
      pushToast({
        title: `Sala ${room.name} creada`,
        variant: "success",
      });
    },
    onError: (err) => {
      setRoomError(
        err instanceof Error ? err.message : "Error de red creando sala",
      );
    },
  });

  useEffect(() => {
    const storedId =
      sessionStorage.getItem(CLIENT_ID_STORAGE_KEY) || createFallbackId();
    sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, storedId);
    setClientId(storedId);

    const candidateAlias =
      initialGuest?.trim() ||
      sessionStorage.getItem(ALIAS_STORAGE_KEY)?.trim() ||
      generateGuestAlias();
    sessionStorage.setItem(ALIAS_STORAGE_KEY, candidateAlias);
    setAlias(candidateAlias);

    setMirrorClientId(`mirror-${createFallbackId().slice(0, 8)}`);
    setMirrorAlias(`Espejo-${Math.floor(100 + Math.random() * 900)}`);
  }, [initialGuest]);

  const activeRoom = rooms.find((r) => r.slug === activeSlug) ??
    rooms[0] ?? {
      id: "room-sandbox",
      slug: "sandbox",
      name: "#sandbox — Sala Demo",
      description: "Sala demo en tiempo real.",
      isPublic: true,
      createdAt: Date.now(),
    };

  const handlePresenceChange = useCallback((nextMembers: PresenceMember[]) => {
    setPresenceMembers(nextMembers);
  }, []);

  const handleOpenSecondTab = () => {
    const guestParam = `Espejo-${Math.floor(100 + Math.random() * 900)}`;
    const url = `/chat?room=${encodeURIComponent(activeRoom.slug)}&guest=${encodeURIComponent(guestParam)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleCreateRoom = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newRoomName.trim();
    if (trimmed.length < 2 || createRoomMutation.isPending) {
      return;
    }
    setRoomError(null);
    createRoomMutation.mutate(trimmed);
  };

  const botActiveInRoom =
    activeRoom.slug === "sandbox" || activeRoom.slug === "general";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/90 px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            aria-label={t.openRoomsMenu}
            onClick={() => setDrawerOpen((prev) => !prev)}
            className="inline-flex rounded-lg border border-zinc-700 p-1.5 text-zinc-300 hover:bg-zinc-800 lg:hidden"
          >
            {drawerOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <Menu className="h-4 w-4" />
            )}
          </button>

          <Link
            href="/"
            className="flex items-center gap-2 font-semibold text-zinc-100"
          >
            <Zap className="h-4 w-4 text-emerald-400" />
            <span>PulseChat RT</span>
          </Link>

          <span className="hidden rounded-md border border-zinc-700 bg-zinc-950 px-2 py-0.5 font-mono text-xs text-zinc-300 sm:inline-block">
            {alias || "..."}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <HealthBadge />
          <LanguageToggle />

          <button
            type="button"
            onClick={() => setSplitPreview((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-xs transition ${
              splitPreview
                ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-300"
                : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500"
            }`}
          >
            <Columns2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {splitPreview ? t.closeSplitView : t.splitView}
            </span>
            <span className="sm:hidden">Split</span>
          </button>

          <button
            type="button"
            onClick={handleOpenSecondTab}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 font-mono text-xs text-emerald-300 transition hover:bg-emerald-500/20"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>{t.openSecondTab}</span>
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {drawerOpen && (
          <button
            type="button"
            aria-label={t.closeRoomsMenu}
            className="fixed inset-0 z-20 bg-black/60 lg:hidden"
            onClick={() => setDrawerOpen(false)}
          />
        )}

        <aside
          className={`${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          } fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-zinc-800 bg-zinc-900 transition-transform lg:static lg:translate-x-0`}
        >
          <div className="border-b border-zinc-800 p-4">
            <label
              htmlFor="sidebar-alias"
              className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-zinc-400"
            >
              {t.yourAlias}
            </label>
            <input
              id="sidebar-alias"
              type="text"
              maxLength={32}
              value={alias}
              onChange={(e) => {
                setAlias(e.target.value);
                sessionStorage.setItem(ALIAS_STORAGE_KEY, e.target.value);
              }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-zinc-100 outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-4">
            <div>
              <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                {t.publicRooms} ({rooms.length})
              </h3>
              <ul className="space-y-1">
                {rooms.map((room) => {
                  const selected = room.slug === activeRoom.slug;
                  return (
                    <li key={room.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSlug(room.slug);
                          setDrawerOpen(false);
                        }}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                          selected
                            ? "bg-emerald-500/15 font-medium text-emerald-300"
                            : "text-zinc-300 hover:bg-zinc-800/70"
                        }`}
                      >
                        <Hash className="h-4 w-4 shrink-0 text-zinc-500" />
                        <span className="truncate">{room.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <form onSubmit={handleCreateRoom} className="mt-3 flex gap-1.5">
                <input
                  type="text"
                  value={newRoomName}
                  maxLength={32}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder={t.newRoomPlaceholder}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-200 outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={
                    createRoomMutation.isPending ||
                    newRoomName.trim().length < 2
                  }
                  title={t.createRoomTitle}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-zinc-200 hover:border-emerald-500/60 disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </form>
              {roomError && (
                <p className="mt-1 text-xs text-rose-400">{roomError}</p>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  {t.presenceIn} #{activeRoom.slug}
                </span>
                <span>{presenceMembers.length}</span>
              </div>

              <ul className="space-y-1.5 text-xs">
                {botActiveInRoom && (
                  <li className="flex items-center justify-between rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-2.5 py-1.5 text-cyan-300">
                    <span className="inline-flex items-center gap-1.5 font-mono">
                      <Bot className="h-3.5 w-3.5" />
                      @SyncBot
                    </span>
                    <span className="font-mono text-[10px] text-cyan-400/80">
                      BOT
                    </span>
                  </li>
                )}

                {presenceMembers.map((member) => (
                  <li
                    key={member.clientId}
                    className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/70 px-2.5 py-1.5 text-zinc-300"
                  >
                    <span className="inline-flex items-center gap-2 truncate font-mono">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      <span className="truncate">{member.alias}</span>
                    </span>
                    {member.clientId === clientId && (
                      <span className="font-mono text-[10px] text-emerald-400">
                        {t.you}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col divide-y divide-zinc-800 md:flex-row md:divide-x md:divide-y-0">
          {clientId && alias ? (
            <ChatPanel
              roomSlug={activeRoom.slug}
              roomName={activeRoom.name}
              roomDescription={activeRoom.description}
              clientId={clientId}
              alias={alias}
              label={splitPreview ? t.clientA : undefined}
              onPresenceChange={handlePresenceChange}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center font-mono text-xs text-zinc-500">
              {t.initializingWs}
            </div>
          )}

          {splitPreview && mirrorClientId && mirrorAlias && (
            <ChatPanel
              roomSlug={activeRoom.slug}
              roomName={activeRoom.name}
              clientId={mirrorClientId}
              alias={mirrorAlias}
              label={t.clientBMirror}
              compact
            />
          )}
        </main>
      </div>
    </div>
  );
}
