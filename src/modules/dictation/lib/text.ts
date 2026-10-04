import type { PrefixKey } from "@/modules/tiling/lib/prefix";

export type ModelId = "tiny.en" | "base.en";

/** The built-in models; sizes match the Rust side's table. */
export const MODELS: readonly { id: ModelId; mb: number; label: string }[] = [
  { id: "tiny.en", mb: 32, label: "tiny.en — 32 MB, faster" },
  { id: "base.en", mb: 60, label: "base.en — 60 MB, more accurate" },
];

export function coerceModel(v: unknown): ModelId {
  return MODELS.some((m) => m.id === v) ? (v as ModelId) : "tiny.en";
}

// Whisper's non-speech annotations: "[BLANK_AUDIO]", "(upbeat music)", "♪".
const BRACKETED = /\[[^\]]*\]/g;
const NON_SPEECH =
  /\([^)]*\b(?:music|silence|applause|laugh\w*|sigh\w*|cough\w*|noise|inaudible|breathing|typing|clicking|wind)\b[^)]*\)/gi;

/** What Whisper heard, minus its markers, on one line. */
export function cleanTranscript(raw: string): string {
  return raw
    .replace(BRACKETED, " ")
    .replace(NON_SPEECH, " ")
    .replace(/[♪♫]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

const PREFIX_LABEL: Record<PrefixKey, string> = {
  "ctrl+b": "Ctrl+B",
  "ctrl+a": "Ctrl+A",
  "ctrl+space": "Ctrl+Space",
};

/** The keys that start and stop dictation, for the prefix in use. */
export function dictationKeys(prefix: PrefixKey): string {
  // With Ctrl+Space as the prefix, pressing it twice sends it to the shell.
  return `${PREFIX_LABEL[prefix]} ${prefix === "ctrl+space" ? "v" : "Ctrl+Space"}`;
}

export function downloadingMessage(model: ModelId, pct: number): string {
  const mb = MODELS.find((m) => m.id === model)?.mb ?? 0;
  return `Downloading the speech model (${mb} MB): ${pct}%.`;
}

export function readyMessage(keys: string): string {
  return `Speech model ready. Press ${keys} to dictate.`;
}

export function listeningMessage(pane: string, keys: string): string {
  return `Listening in ${pane.toLowerCase()}. ${keys} to stop, Esc to cancel.`;
}

export function dictatedMessage(words: number, pane: string): string {
  return `Dictated ${words} ${words === 1 ? "word" : "words"} into ${pane.toLowerCase()}.`;
}
