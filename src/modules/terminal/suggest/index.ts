import type { IDecoration, IDisposable, IMarker, Terminal } from "@xterm/xterm";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { historyRecord, historySuggest } from "../block/lib/history";
import { acceptKind, createSuggestEngine, type SuggestEngine } from "./engine";

/**
 * TOSS Terminal's command suggestions, wired to the panes: one engine per
 * pane (leaf), fed its keystrokes and shell prompt state, drawing its grey
 * text with an xterm decoration at the cursor. Normal terminals only; Blocks
 * tabs have their own input.
 */

/** The OSC the shell integration sends when the shell suggests by itself. */
export const SHELL_SUGGESTS_OSC = 7777;

type Pane = {
  engine: SuggestEngine;
  term: Terminal | null;
  marker: IMarker | null;
  decoration: IDecoration | null;
  listeners: IDisposable[];
};

const panes = new Map<number, Pane>();

function clear(p: Pane) {
  p.decoration?.dispose();
  p.marker?.dispose();
  p.decoration = null;
  p.marker = null;
}

function draw(p: Pane, suffix: string | null) {
  clear(p);
  const term = p.term;
  if (!term || !suffix) return;
  const buf = term.buffer.active;
  if (buf.type === "alternate") return;
  const x = buf.cursorX;
  const room = term.cols - x;
  if (room <= 0) return;
  const text = Array.from(suffix).slice(0, room).join("");
  const marker = term.registerMarker(0);
  if (!marker) return;
  const decoration = term.registerDecoration({
    marker,
    x,
    width: Array.from(text).length,
    layer: "top",
  });
  if (!decoration) {
    marker.dispose();
    return;
  }
  decoration.onRender((el) => {
    el.textContent = text;
    el.classList.add("toss-suggestion");
    const o = term.options;
    el.style.fontFamily = o.fontFamily ?? "monospace";
    el.style.fontSize = `${o.fontSize ?? 13}px`;
    el.style.letterSpacing = `${o.letterSpacing ?? 0}px`;
    el.style.lineHeight = el.style.height;
  });
  p.marker = marker;
  p.decoration = decoration;
}

function paneFor(leafId: number): Pane {
  let p = panes.get(leafId);
  if (p) return p;
  const pane: Pane = {
    term: null,
    marker: null,
    decoration: null,
    listeners: [],
    engine: createSuggestEngine({
      enabled: () =>
        usePreferencesStore.getState().terminalSuggestions !== "off",
      suggest: historySuggest,
      record: historyRecord,
      show: (suffix) => draw(pane, suffix),
    }),
  };
  panes.set(leafId, pane);
  p = pane;
  return p;
}

/**
 * Attach a pane's terminal (when its renderer slot is set up): follow the
 * cursor so the grey text stays right after what's typed, and listen for the
 * shell saying it suggests by itself. Returns the detach.
 */
export function attachSuggestions(leafId: number, term: Terminal): () => void {
  const p = paneFor(leafId);
  p.term = term;
  const redraw = () => draw(p, p.engine.visible());
  const osc = term.parser.registerOscHandler(SHELL_SUGGESTS_OSC, (data) => {
    if (data.startsWith("shell-suggests")) p.engine.markShellSuggests();
    return true;
  });
  p.listeners.push(
    term.onCursorMove(redraw),
    term.buffer.onBufferChange(redraw),
    osc,
  );
  return () => {
    clear(p);
    for (const l of p.listeners) l.dispose();
    p.listeners = [];
    if (p.term === term) p.term = null;
  };
}

/** The shell's prompt state, from its integration markers. */
export function suggestPromptState(leafId: number, running: boolean): void {
  panes.get(leafId)?.engine.promptState(running);
}

/** Keystrokes and pastes on their way to a pane's shell. */
export function suggestInput(leafId: number, data: string): void {
  panes.get(leafId)?.engine.input(data);
}

/**
 * A key that takes the suggestion (Right, End, Ctrl+F; Ctrl/Option+Right for
 * a word): the text to send to the shell, or null to let the key through.
 */
export function suggestAccept(
  leafId: number,
  event: KeyboardEvent,
): string | null {
  if (event.type !== "keydown") return null;
  const kind = acceptKind(event);
  if (!kind) return null;
  return panes.get(leafId)?.engine.accept(kind) ?? null;
}

export function disposeSuggestions(leafId: number): void {
  const p = panes.get(leafId);
  if (!p) return;
  clear(p);
  for (const l of p.listeners) l.dispose();
  panes.delete(leafId);
}
