import { usePreferencesStore } from "@/modules/settings/preferences";
import { applyTheme as applyTerminalTheme } from "@/modules/terminal/lib/rendererPool";
import { useEffect } from "react";
import { useTheme } from "./ThemeProvider";
import { applyTranslucency, setWindowBackdrop } from "./translucency";

/**
 * Main window only: the see-through window and its blurred backdrop, driven
 * by Settings → Themes → Translucent window / Opacity (TOSS Terminal).
 */
export function TranslucencyBridge() {
  const enabled = usePreferencesStore((s) => s.windowTranslucent);
  const opacity = usePreferencesStore((s) => s.windowOpacity);
  const hydrated = usePreferencesStore((s) => s.hydrated);
  const { resolvedMode } = useTheme();

  // biome-ignore lint/correctness/useExhaustiveDependencies: resolvedMode is the trigger; a light/dark switch rewrites the theme variables and the overrides must follow.
  useEffect(() => {
    if (!hydrated) return;
    applyTranslucency(enabled ? opacity : null);
    void setWindowBackdrop(enabled);
    // Terminals pick up the clear (or solid) background on the next frame,
    // once the theme's own variables are settled; a change of transparency
    // rebuilds their WebGL renderer (see rendererPool.applyTheme).
    const id = requestAnimationFrame(() => applyTerminalTheme());
    return () => cancelAnimationFrame(id);
  }, [enabled, opacity, hydrated, resolvedMode]);

  return null;
}
