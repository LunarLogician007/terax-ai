import { useEffect, useSyncExternalStore } from "react";
import { describePane, postMessage } from "@/modules/messages/lib/messages";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { pasteIntoLeaf } from "@/modules/terminal/lib/rendererPool";
import { startLiveMic } from "./lib/audio";
import {
  downloadModel,
  loadModel,
  modelReady,
  transcribeLive,
  unloadModel,
} from "./lib/builtin";
import { createDictation, type Dictation } from "./lib/controller";
import { dictationKeys } from "./lib/text";

// For a pane that isn't on screen (no live terminal to paste into).
let writeToLeaf: (leafId: number, text: string) => boolean = () => false;

/**
 * Terminal dictation (Terax Tiling), one per window: the keys (prefix, then
 * Ctrl+Space) and the status bar's "mic" switch drive the same controller.
 */
export const dictation: Dictation = createDictation({
  model: () => usePreferencesStore.getState().sttBuiltinModel,
  keys: () => dictationKeys(usePreferencesStore.getState().tilingPrefix),
  modelReady,
  download: downloadModel,
  load: loadModel,
  unload: unloadModel,
  startMic: startLiveMic,
  transcribeLive,
  // Bracketed paste where the pane is live; dictated text is one line with
  // no Enter, so writing it to the shell directly is safe too.
  paste: (leaf, text) => pasteIntoLeaf(leaf, text) || writeToLeaf(leaf, text),
  describe: describePane,
  post: postMessage,
  setTimer: (fn, ms) => window.setTimeout(fn, ms),
  clearTimer: (h) => window.clearTimeout(h as number),
});

/** Wire dictation to the app: the off-screen fallback, and Esc to cancel. */
export function useDictation(
  write: (leafId: number, text: string) => boolean,
): Dictation {
  writeToLeaf = write;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !dictation.cancel()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  return dictation;
}

/** The switch's state, for the status bar. */
export function useDictationSwitch(): { on: boolean; busy: boolean } {
  const on = useSyncExternalStore(dictation.subscribe, dictation.enabled);
  const busy = useSyncExternalStore(dictation.subscribe, dictation.switching);
  return { on, busy };
}
