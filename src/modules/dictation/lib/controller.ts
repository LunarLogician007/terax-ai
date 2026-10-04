import type { MessageInput } from "@/modules/messages/lib/messages";
import {
  type AgreementState,
  EMPTY_AGREEMENT,
  finishAgreement,
  promptFor,
  type Seg,
  stepAgreement,
} from "./agreement";
import {
  dictatedMessage,
  downloadingMessage,
  listeningMessage,
  liveMessage,
  type ModelId,
  readyMessage,
} from "./text";

/** Recording stops by itself after this long. */
export const MAX_LISTEN_MS = 120_000;
/** Pause between live passes (each starts after the last one finishes). */
export const PASS_MS = 1000;
/** Don't run a pass on less audio than this (16 kHz samples). */
const MIN_PASS_SAMPLES = 8000;
const KEY = "dictation";

/** The microphone, read live as 16 kHz mono. */
export type LiveMic = {
  /** The audio heard since the last trim. */
  snapshot: () => Float32Array;
  /** Drop this much audio from the front (it's typed already). */
  trim: (ms: number) => void;
  /** Stop listening and hand back the last snapshot. */
  stop: () => Float32Array;
  /** Stop listening and throw the audio away. */
  cancel: () => void;
};

export type DictationDeps = {
  model: () => ModelId;
  /** The keys that toggle dictation, for messages. */
  keys: () => string;
  modelReady: (model: ModelId) => Promise<boolean>;
  download: (model: ModelId, onPct: (pct: number) => void) => Promise<void>;
  startMic: () => Promise<LiveMic>;
  /** Phrases with times, given the typed words as context. */
  transcribeLive: (
    model: ModelId,
    samples: Float32Array,
    prompt: string,
  ) => Promise<Seg[]>;
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
 * Live dictation into a terminal pane: press to listen, and words are typed
 * into the pane it started in about a second behind you, once Whisper is
 * sure of them (never taken back, never Enter). Press again to type the rest.
 * Every step shows in the top bar's message line, updated in place.
 */
export function createDictation(deps: DictationDeps) {
  let phase: DictationPhase = "idle";
  let mic: LiveMic | null = null;
  let leafId: number | null = null;
  let agreement: AgreementState = EMPTY_AGREEMENT;
  let limitTimer: unknown = null;
  let passTimer: unknown = null;
  let inflight: Promise<void> | null = null;

  const post = (m: Omit<MessageInput, "key">) => deps.post({ ...m, key: KEY });

  function reset() {
    deps.clearTimer(limitTimer);
    deps.clearTimer(passTimer);
    mic = null;
    leafId = null;
    agreement = EMPTY_AGREEMENT;
    phase = "idle";
  }

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

  /** Type words into the pane; false (and dictation stops) if it's gone. */
  function type(words: string[]): boolean {
    if (words.length === 0 || leafId === null) return true;
    const lead = agreement.typed.length > words.length ? " " : "";
    if (deps.paste(leafId, lead + words.join(" "))) return true;
    mic?.cancel();
    reset();
    post({ text: "The pane closed; dictation stopped.", kind: "warning" });
    return false;
  }

  function schedulePass() {
    passTimer = deps.setTimer(() => {
      inflight = pass();
    }, PASS_MS);
  }

  async function pass(): Promise<void> {
    if (phase !== "listening" || !mic || leafId === null) return;
    const samples = mic.snapshot();
    if (samples.length >= MIN_PASS_SAMPLES) {
      let segs: Seg[];
      try {
        segs = await deps.transcribeLive(
          deps.model(),
          samples,
          promptFor(agreement),
        );
      } catch (e) {
        // A failed pass isn't fatal: the next one, or the last, can recover.
        console.warn("dictation.pass", e);
        segs = [];
      }
      // Stopped or cancelled while Whisper worked: the last pass takes over.
      if (phase !== "listening" || !mic || leafId === null) return;
      if (segs.length > 0) {
        const step = stepAgreement(agreement, segs);
        agreement = step.state;
        if (!type(step.commit)) return;
        if (step.trimMs > 0) mic.trim(step.trimMs);
        const pane = deps.describe(leafId);
        post({
          text:
            step.tail.length > 0
              ? liveMessage(pane.label, step.tail)
              : listeningMessage(pane.label, deps.keys()),
          kind: "info",
          sticky: true,
          target: pane.target,
        });
      }
    }
    schedulePass();
  }

  async function start(leaf: number): Promise<void> {
    const model = deps.model();
    if (!(await deps.modelReady(model))) return download(model);
    try {
      mic = await deps.startMic();
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
    agreement = EMPTY_AGREEMENT;
    const pane = deps.describe(leaf);
    post({
      text: listeningMessage(pane.label, deps.keys()),
      kind: "info",
      sticky: true,
      target: pane.target,
    });
    limitTimer = deps.setTimer(() => void finish(), MAX_LISTEN_MS);
    schedulePass();
  }

  async function finish(): Promise<void> {
    if (phase !== "listening" || !mic || leafId === null) return;
    deps.clearTimer(limitTimer);
    deps.clearTimer(passTimer);
    phase = "transcribing";
    post({ text: "Transcribing…", kind: "info", sticky: true });
    await inflight; // its result is dropped; this last pass covers it
    const leaf = leafId;
    const samples = mic.stop();
    try {
      const segs = await deps.transcribeLive(
        deps.model(),
        samples,
        promptFor(agreement),
      );
      const rest = finishAgreement(agreement, segs);
      agreement = { ...agreement, typed: [...agreement.typed, ...rest] };
      if (!type(rest)) return;
      const total = agreement.typed.length;
      if (total === 0) {
        post({ text: "Heard nothing.", kind: "info" });
      } else {
        const pane = deps.describe(leaf);
        post({
          text: dictatedMessage(total, pane.label),
          kind: "success",
          target: pane.target,
        });
      }
    } catch (e) {
      post({ text: `Transcription failed: ${errorText(e)}`, kind: "error" });
    } finally {
      if (phase === "transcribing") reset();
    }
  }

  return {
    phase: () => phase,
    /** The dictation key: start, or stop and type the rest. */
    async toggle(activeLeaf: number | null): Promise<void> {
      if (phase === "listening") return finish();
      if (phase !== "idle") return; // downloading or transcribing: wait
      if (activeLeaf === null) {
        post({ text: "Focus a terminal to dictate.", kind: "warning" });
        return;
      }
      return start(activeLeaf);
    },
    /**
     * Esc: stop without typing the rest. Words already typed stay (no
     * backspacing into the pane). False when there was nothing to stop.
     */
    cancel(): boolean {
      if (phase !== "listening" || !mic) return false;
      const kept = agreement.typed.length;
      mic.cancel();
      reset();
      post({
        text:
          kept > 0
            ? `Dictation stopped. Kept the ${kept} ${kept === 1 ? "word" : "words"} already typed.`
            : "Dictation cancelled.",
        kind: "info",
      });
      return true;
    },
  };
}

export type Dictation = ReturnType<typeof createDictation>;
