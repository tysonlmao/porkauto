import type { DisplayThemeMode } from "@/store/types";

export type { DisplayThemeMode };

export type ResolvedAppearance = "dark" | "light";

export const DISPLAY_THEME_MODES: DisplayThemeMode[] = [
  "dark",
  "light",
  "system",
  "daylight",
];

export function parseDisplayThemeMode(raw: unknown): DisplayThemeMode {
  if (
    raw === "dark" ||
    raw === "light" ||
    raw === "system" ||
    raw === "daylight"
  ) {
    return raw;
  }
  return "dark";
}

/** Rough local daylight: civil day ~06:00–18:30 (good enough for map dimming). */
export function isDaylightLocal(now = new Date()): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= 6 * 60 && minutes < 18 * 60 + 30;
}

export function resolveAppearance(
  mode: DisplayThemeMode,
  now = new Date(),
  prefersDark?: boolean,
): ResolvedAppearance {
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  if (mode === "daylight") return isDaylightLocal(now) ? "light" : "dark";
  if (prefersDark == null && typeof window !== "undefined") {
    prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return prefersDark === false ? "light" : "dark";
}
