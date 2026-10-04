import { useEffect, useMemo, useRef } from "react";
import { describePane, postMessage } from "@/modules/messages/lib/messages";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { pasteIntoLeaf } from "@/modules/terminal/lib/rendererPool";
import { startLiveMic } from "./lib/audio";
import { downloadModel, modelReady, transcribeLive } from "./lib/builtin";
import { createDictation, type Dictation } from "./lib/controller";
import { dictationKeys } from "./lib/text";

/**
 * Terminal dictation (Terax Tiling): the controller, wired to the
 * microphone, the built-in Whisper model, the panes and the message line.
 * Esc cancels while listening. `writeToLeaf` is the fallback for a pane
 * that isn't on screen (no live terminal to paste into).
 */
export function useDictation(
  writeToLeaf: (leafId: number, text: string) => boolean,
): Dictation {
  const write = useRef(writeToLeaf);
  write.current = writeToLeaf;

  const dictation = useMemo(
    () =>
      createDictation({
        model: () => usePreferencesStore.getState().sttBuiltinModel,
        keys: () => dictationKeys(usePreferencesStore.getState().tilingPrefix),
        modelReady,
        download: downloadModel,
        startMic: startLiveMic,
        transcribeLive,
        // Bracketed paste where the pane is live; dictated text is one line
        // with no Enter, so writing it to the shell directly is safe too.
        paste: (leaf, text) =>
          pasteIntoLeaf(leaf, text) || write.current(leaf, text),
        describe: describePane,
        post: postMessage,
        setTimer: (fn, ms) => window.setTimeout(fn, ms),
        clearTimer: (h) => window.clearTimeout(h as number),
      }),
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !dictation.cancel()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, [dictation]);

  return dictation;
}
