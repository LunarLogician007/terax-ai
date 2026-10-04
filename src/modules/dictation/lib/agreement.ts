import { cleanTranscript } from "./text";

/** One phrase from Whisper, with times relative to the audio it was given. */
export type Seg = { text: string; startMs: number; endMs: number };

/**
 * Live dictation's "type it once it's settled" rule (LocalAgreement, as in
 * whisper_streaming). Each pass re-reads the audio not yet trimmed; a word is
 * typed once two passes in a row agree on it, and is never taken back.
 */
export type AgreementState = {
  /** Last pass's words after the typed ones: the candidates. */
  prev: string[];
  /** Typed words whose audio is still in the window (not yet trimmed). */
  inWindow: number;
  /** Everything typed this dictation, for the context prompt and the count. */
  typed: string[];
};

export const EMPTY_AGREEMENT: AgreementState = {
  prev: [],
  inWindow: 0,
  typed: [],
};

const splitWords = (text: string): string[] =>
  cleanTranscript(text).split(" ").filter(Boolean);

// Compare as spoken: "Commit," and "commit" are the same word.
const norm = (w: string): string =>
  w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "") || w;

function commonPrefix(a: string[], b: string[]): number {
  let n = 0;
  while (n < a.length && n < b.length && norm(a[n]) === norm(b[n])) n++;
  return n;
}

/** The words of a pass that aren't typed yet, plus each phrase's word count. */
function fresh(state: AgreementState, segs: Seg[]) {
  const perSeg = segs.map((s) => splitWords(s.text));
  const all = perSeg.flat();
  return { perSeg, words: all.slice(state.inWindow) };
}

export type AgreementStep = {
  state: AgreementState;
  /** Words to type now, in the newer pass's spelling. */
  commit: string[];
  /** The still-changing words, for the top bar. */
  tail: string[];
  /** Audio to drop from the front of the window, in ms (0 for none). */
  trimMs: number;
};

export function stepAgreement(
  state: AgreementState,
  segs: Seg[],
): AgreementStep {
  const { perSeg, words } = fresh(state, segs);
  const n = commonPrefix(words, state.prev);
  const commit = words.slice(0, n);
  let inWindow = state.inWindow + n;

  // Drop the audio of phrases whose words are all typed, never the last
  // phrase of the pass: its end is where Whisper ran out of audio, not where
  // you stopped speaking.
  let trimMs = 0;
  let trimmedWords = 0;
  let counted = 0;
  for (let i = 0; i < segs.length - 1; i++) {
    counted += perSeg[i].length;
    if (counted > inWindow) break;
    trimMs = segs[i].endMs;
    trimmedWords = counted;
  }
  inWindow -= trimmedWords;

  return {
    state: {
      prev: words.slice(n),
      inWindow,
      typed: [...state.typed, ...commit],
    },
    commit,
    tail: words.slice(n),
    trimMs,
  };
}

/** The last pass, after you stop: type everything not typed yet. */
export function finishAgreement(state: AgreementState, segs: Seg[]): string[] {
  return fresh(state, segs).words;
}

/** The context prompt for the next pass: the last words typed. */
export function promptFor(state: AgreementState): string {
  return state.typed.slice(-30).join(" ");
}
