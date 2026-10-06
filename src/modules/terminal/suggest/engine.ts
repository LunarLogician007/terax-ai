import { applyInput, FRESH, type LineState } from "./lineModel";

/** The part of a suggested command not typed yet, or null. */
export function suffixFor(line: string, full: string): string | null {
  return full.length > line.length && full.startsWith(line)
    ? full.slice(line.length)
    : null;
}

/** One word of a suggestion: leading blanks, then up to the next blank. */
export function nextWord(suffix: string): string {
  return suffix.match(/^\s*\S*/)?.[0] || suffix;
}

/**
 * Keys that take a visible suggestion, as in fish and zsh-autosuggestions:
 * Right, End or Ctrl+F take it all; Ctrl+Right or Option/Alt+Right one word.
 */
export function acceptKind(
  e: Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "metaKey" | "shiftKey">,
): "all" | "word" | null {
  if (e.shiftKey || e.metaKey) return null;
  if (e.key === "ArrowRight") {
    if (e.ctrlKey || e.altKey) return "word";
    return "all";
  }
  if (e.ctrlKey || e.altKey) return e.ctrlKey && e.key === "f" ? "all" : null;
  return e.key === "End" ? "all" : null;
}

export type SuggestDeps = {
  /** The "Command suggestions" setting isn't Off. */
  enabled: () => boolean;
  /** A full command from history starting with the line, or null. */
  suggest: (line: string) => Promise<string | null>;
  /** Remember a command that ran, so it can be suggested. */
  record: (command: string) => void;
  /** Draw the grey rest after the cursor, or hide it (null). */
  show: (suffix: string | null) => void;
};

/**
 * Command suggestions for one terminal pane (TOSS Terminal). Fed the pane's
 * keystrokes and its shell's prompt state; shows a history suggestion while
 * the typed line is known, and none otherwise.
 */
export function createSuggestEngine(deps: SuggestDeps) {
  let line: LineState = FRESH;
  let atPrompt = false;
  let shellSuggests = false;
  let full: string | null = null;
  let seq = 0;

  const active = () =>
    deps.enabled() && !shellSuggests && atPrompt && line.certain;

  function hide() {
    full = null;
    deps.show(null);
  }

  function refresh() {
    const text = line.text;
    if (!active() || !text.trim()) {
      seq++;
      hide();
      return;
    }
    // Keep showing the current suggestion while it still fits what's typed.
    const fits = full !== null ? suffixFor(text, full) : null;
    if (fits) deps.show(fits);
    else hide();
    const mine = ++seq;
    void deps.suggest(text).then((next) => {
      if (mine !== seq || !active() || line.text !== text) return;
      const rest = next ? suffixFor(text, next) : null;
      if (rest) {
        full = next;
        deps.show(rest);
      } else {
        hide();
      }
    });
  }

  return {
    /** From the shell integration: false = at a prompt, true = running. */
    promptState(running: boolean) {
      atPrompt = !running;
      line = FRESH;
      seq++;
      hide();
    },
    /** Keystrokes and pastes on their way to the shell. */
    input(data: string) {
      const r = applyInput(line, data);
      line = r.state;
      if (r.submitted) deps.record(r.submitted.trim());
      refresh();
    },
    /** The shell has suggestions of its own (zsh-autosuggestions, fish). */
    markShellSuggests() {
      shellSuggests = true;
      seq++;
      hide();
    },
    /** Take the suggestion (all or one word); the text to send, or null. */
    accept(kind: "all" | "word"): string | null {
      if (!active() || full === null) return null;
      const rest = suffixFor(line.text, full);
      if (!rest) return null;
      const taken = kind === "all" ? rest : nextWord(rest);
      line = { text: line.text + taken, certain: true };
      refresh();
      return taken;
    },
    /** The grey text showing now, if any (to redraw it after the cursor moves). */
    visible(): string | null {
      return active() && full !== null ? suffixFor(line.text, full) : null;
    },
  };
}

export type SuggestEngine = ReturnType<typeof createSuggestEngine>;
