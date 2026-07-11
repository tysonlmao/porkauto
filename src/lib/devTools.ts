/**
 * Dev HUD controls (PRND swipe, reset setup) and “Skip setup (dev)”.
 * Set `VITE_DEV_TOOLS=true` (or `1`) in `.env` to enable.
 */
export function devToolsEnabled(): boolean {
  const raw = import.meta.env.VITE_DEV_TOOLS?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}
