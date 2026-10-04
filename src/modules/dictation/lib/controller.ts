import type { MessageInput } from "@/modules/messages/lib/messages";
import {
  cleanTranscript,
  dictatedMessage,
  downloadingMessage,
  listeningMessage,
  type ModelId,
  readyMessage,
  wordCount,
} from "./text";

/** Recording stops by itself after this long. */
export const MAX_LISTEN_MS = 120_000;
const KEY = "dictation";

export type Recording = {
  /** Stop and hand back 16 kHz mono samples. */
  stop: () => Promise<Float32Array>;
  /** Stop and throw the audio away. */
  cancel: () => void;
};

export type DictationDeps = {
  model: () => ModelId;
  /** The keys that toggle dictation, for messages. */
  keys: () => string;
  modelReady: (model: ModelId) => Promise<boolean>;
  download: (model: ModelId, onPct: (pct: number) => void) => Promise<void>;
  startRecording: () => Promise<Recording>;
  transcribe: (model: ModelId, samples: Float32Array) => Promise<string>;
  /** Type the text into the pane; false when the pane is gone. */
  paste: (leafId: number, text: string) => boolean;
  describe: (leafId: number) => {
    label: string;
    target?: { tabId: number; leafId: number };
  };
  post: (message: MessageInput) => void;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
};

export type DictationPhase =
  | "idle"
  | "downloading"
  | "listening"
  | "transcribing";

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Dictation into a terminal pane: press to listen, press again to type what
 * was said into the pane it started in (never pressing Enter). Every step
 * says so in the top bar's message line, updated in place.
 */
export function createDictation(deps: DictationDeps) {
  let phase: DictationPhase = "idle";
  let recording: Recording | null = null;
  let leafId: number | null = null;
  let timer: unknown = null;

  const post = (m: Omit<MessageInput, "key">) => deps.post({ ...m, key: KEY });

  async function download(model: ModelId): Promise<void> {
    phase = "downloading";
    let shown = -1;
    const progress = (pct: number) => {
      if (pct === shown) return;
      shown = pct;
      post({
        text: downloadingMessage(model, pct),
        kind: "info",
        sticky: true,
      });
    };
    progress(0);
    try {
      await deps.download(model, progress);
      post({ text: readyMessage(deps.keys()), kind: "success" });
    } catch (e) {
      post({
        text: `The speech model download failed: ${errorText(e)}`,
        kind: "error",
      });
    } finally {
      phase = "idle";
    }
  }

  async function start(leaf: number): Promise<void> {
    const model = deps.model();
    if (!(await deps.modelReady(model))) return download(model);
    try {
      recording = await deps.startRecording();
    } catch (e) {
      const refused =
        (e instanceof Error && e.name === "NotAllowedError") ||
        errorText(e).includes("NotAllowed");
      post({
        text: refused
          ? "Microphone access was refused."
          : `Couldn't start the microphone: ${errorText(e)}`,
        kind: "error",
      });
      return;
    }
    phase = "listening";
    leafId = leaf;
    const pane = deps.describe(leaf);
    post({
      text: listeningMessage(pane.label, deps.keys()),
      kind: "info",
      sticky: true,
      target: pane.target,
    });
    timer = deps.setTimer(() => void finish(), MAX_LISTEN_MS);
  }

  async function finish(): Promise<void> {
    if (phase !== "listening" || !recording || leafId === null) return;
    deps.clearTimer(timer);
    const rec = recording;
    const leaf = leafId;
    recording = null;
    phase = "transcribing";
    post({ text: "Transcribing…", kind: "info", sticky: true });
    try {
      const samples = await rec.stop();
      const text = cleanTranscript(
        await deps.transcribe(deps.model(), samples),
      );
      if (!text) {
        post({ text: "Heard nothing.", kind: "info" });
      } else if (deps.paste(leaf, text)) {
        const pane = deps.describe(leaf);
        post({
          text: dictatedMessage(wordCount(text), pane.label),
          kind: "success",
          target: pane.target,
        });
      } else {
        post({
          text: "The pane closed before the text arrived.",
          kind: "warning",
        });
      }
    } catch (e) {
      post({ text: `Transcription failed: ${errorText(e)}`, kind: "error" });
    } finally {
      phase = "idle";
      leafId = null;
    }
  }

  return {
    phase: () => phase,
    /** The dictation key: start, or stop and transcribe. */
    async toggle(activeLeaf: number | null): Promise<void> {
      if (phase === "listening") return finish();
      if (phase !== "idle") return; // downloading or transcribing: wait
      if (activeLeaf === null) {
        post({ text: "Focus a terminal to dictate.", kind: "warning" });
        return;
      }
      return start(activeLeaf);
    },
    /** Esc: throw the recording away. False when there was nothing to cancel. */
    cancel(): boolean {
      if (phase !== "listening" || !recording) return false;
      deps.clearTimer(timer);
      recording.cancel();
      recording = null;
      leafId = null;
      phase = "idle";
      post({ text: "Dictation cancelled.", kind: "info" });
      return true;
    },
  };
}

export type Dictation = ReturnType<typeof createDictation>;
