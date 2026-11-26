import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatMessageTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function generateGuestAlias(): string {
  const adjectives = [
    "Veloz",
    "Ágil",
    "Delta",
    "Pixel",
    "Cobalto",
    "Sync",
    "Nodo",
    "Nova",
  ];
  const suffix = Math.floor(100 + Math.random() * 900);
  const adj =
    adjectives[Math.floor(Math.random() * adjectives.length)] ?? "Invitado";
  return `Invitado-${adj}-${suffix}`;
}
