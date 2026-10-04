import { invoke } from "@tauri-apps/api/core";

/**
 * The see-through window (Terax Tiling).
 *
 * Stacked translucent layers multiply, so a translucent terminal on a
 * translucent pane on a translucent panel ends up nearly opaque and uneven.
 * Instead one layer, the page itself, paints the theme background at the
 * chosen opacity over macOS's blurred backdrop; the main surface goes clear
 * over it, cards and the sidebar keep a faint tint, and popovers stay solid so
 * menus remain readable. The terminal draws a clear background (see
 * terminalBackground) and sits straight on that one layer.
 */

const CARD_TINT = 0.25;

/** `color` with its alpha replaced, for rgb(), rgba() and hex colours. */
export function withAlpha(color: string, alpha: number): string {
  const c = color.trim();
  const rgb = c.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h =
      hex[1].length === 3
        ? hex[1]
            .split("")
            .map((x) => x + x)
            .join("")
        : hex[1];
    const n = Number.parseInt(h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  return color;
}

export type SurfaceBase = { background: string; card: string; sidebar: string };

/** What translucency changes, given the theme's resolved surface colours. */
export function translucentOverrides(
  base: SurfaceBase,
  alpha: number,
): { backdrop: string; vars: Record<string, string> } {
  return {
    backdrop: withAlpha(base.background, alpha),
    vars: {
      "--background": "transparent",
      "--card": withAlpha(base.card, CARD_TINT),
      "--sidebar": withAlpha(base.sidebar, CARD_TINT),
    },
  };
}

let current: number | null = null;
/** Inline values the overrides replaced, to put back when turned off. */
const replaced = new Map<string, string | null>();

let probe: HTMLDivElement | null = null;
function resolveColor(varName: string): string {
  if (!probe?.isConnected) {
    probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:absolute;visibility:hidden;pointer-events:none;width:0;height:0;";
    document.body.appendChild(probe);
  }
  probe.style.color = `var(${varName})`;
  return getComputedStyle(probe).color;
}

function restore(root: HTMLElement): void {
  for (const [name, value] of replaced) {
    if (value === null) root.style.removeProperty(name);
    else root.style.setProperty(name, value);
  }
  replaced.clear();
  root.style.removeProperty("background-color");
}

function apply(root: HTMLElement, alpha: number): void {
  const base: SurfaceBase = {
    background: resolveColor("--background"),
    card: resolveColor("--card"),
    sidebar: resolveColor("--sidebar"),
  };
  const { backdrop, vars } = translucentOverrides(base, alpha);
  for (const [name, value] of Object.entries(vars)) {
    replaced.set(name, root.style.getPropertyValue(name) || null);
    root.style.setProperty(name, value);
  }
  root.style.backgroundColor = backdrop;
}

/** Turn translucency on at `alpha` (0.4–1), or off with null. */
export function applyTranslucency(alpha: number | null): void {
  const root = document.documentElement;
  restore(root);
  current = alpha;
  root.dataset.translucent = alpha === null ? "off" : "on";
  if (alpha !== null) apply(root, alpha);
}

/**
 * Call after a theme has been written: the theme reset the variables, so the
 * values saved for restoring are stale and the overrides must be made again.
 */
export function reapplyTranslucency(): void {
  replaced.clear();
  if (current === null) return;
  const root = document.documentElement;
  root.style.removeProperty("background-color");
  apply(root, current);
}

export function translucencyActive(): boolean {
  return current !== null;
}

/** The terminal's background: clear while translucent, else the theme's. */
export function terminalBackground(themeBackground: string): string {
  return current === null ? themeBackground : "rgba(0, 0, 0, 0)";
}

/** Ask macOS for (or remove) the blurred backdrop behind the window. */
export async function setWindowBackdrop(enabled: boolean): Promise<void> {
  try {
    const kind = await invoke<string>("window_backdrop_kind");
    if (kind === "none") return;
    await invoke("window_set_backdrop", { enabled });
  } catch {
    // An older native side, or no backdrop on this platform: stay opaque-ish.
  }
}
