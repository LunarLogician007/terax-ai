import { useEffect, useRef } from "react";
import { create } from "zustand";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { Tab } from "@/modules/tabs/lib/useTabs";
import {
  IDLE,
  type PrefixState,
  stepPrefix,
  type TilingAction,
} from "./prefix";

/** Whether the prefix is armed, for the status bar's indicator. */
const useTilingPrefixArmedStore = create<{
  armed: boolean;
  set: (armed: boolean) => void;
}>((set) => ({ armed: false, set: (armed) => set({ armed }) }));

export const useTilingPrefixArmed = () =>
  useTilingPrefixArmedStore((s) => s.armed);

/**
 * The Ctrl+B layer. Listens in the capture phase, so it must be registered
 * before useGlobalShortcuts: a key it consumes is stopped there and reaches
 * neither the terminal nor a global shortcut.
 */
export function useTilingPrefix(opts: {
  activeTab: Tab | undefined;
  onAction: (action: TilingAction) => void;
  disabled: boolean;
}): void {
  const prefix = usePreferencesStore((s) => s.tilingPrefix);
  const state = useRef<PrefixState>(IDLE);
  // Everything the listener reads lives in a ref, so the listener is added
  // once and keeps its place ahead of useGlobalShortcuts' listener. Adding it
  // again (say, when the prefix setting changes) would put it behind, and a
  // global shortcut on the same key (Ctrl+B on Windows and Linux) would fire
  // as well.
  const latest = useRef({ ...opts, prefix });
  latest.current = { ...opts, prefix };

  useEffect(() => {
    const setArmed = useTilingPrefixArmedStore.getState().set;
    const onKey = (e: KeyboardEvent) => {
      const { activeTab, onAction, disabled, prefix } = latest.current;
      // Only keys typed into the terminal area count: Ctrl+B in the AI panel
      // or any other text field stays that field's.
      const target = e.target instanceof Element ? e.target : null;
      const fromTerminal =
        target === null ||
        target === document.body ||
        target.closest("[data-terminal-tab]") !== null;
      const inTerminal =
        !disabled && fromTerminal && activeTab?.kind === "terminal";
      const result = stepPrefix(
        state.current,
        e,
        prefix,
        performance.now(),
        inTerminal,
      );
      state.current = result.state;
      setArmed(result.state.mode === "armed");
      if (result.consume) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      if (result.action) onAction(result.action);
    };
    const reset = () => {
      state.current = IDLE;
      setArmed(false);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("blur", reset);
    };
  }, []);

  // Switching tabs disarms.
  const tabId = opts.activeTab?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on every tab change by design; tabId is the trigger.
  useEffect(() => {
    state.current = IDLE;
    useTilingPrefixArmedStore.getState().set(false);
  }, [tabId]);
}
