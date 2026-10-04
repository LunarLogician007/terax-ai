import { create } from "zustand";

/**
 * The top-bar message line (Terax Tiling), after tuios's dock messages: one
 * line at the right of the header that says what just happened (a copy, a
 * paste, a pane closing), burns down and goes away. Pure state functions here,
 * a small store below.
 */

export type MessageKind = "info" | "success" | "warning" | "error";

export type MessageInput = {
  text: string;
  kind: MessageKind;
  /** Same key → the message is updated in place (one copy line per pane). */
  key?: string;
  /** A pane the message is about; clicking the message goes there. */
  target?: { tabId: number; leafId: number };
};

export type Message = MessageInput & {
  id: string;
  at: number;
  /** ms on screen; null stays until dismissed (errors). */
  duration: number | null;
  dismissed: boolean;
};

export type MessageState = { history: Message[] };

export const EMPTY: MessageState = { history: [] };
export const HISTORY_CAP = 20;
const INFO_MS = 6000;
const PREVIEW_LEN = 40;

/** How long a message of this kind stays up, as in tuios. */
export function durationFor(kind: MessageKind): number | null {
  if (kind === "error") return null;
  if (kind === "warning") return INFO_MS * 2;
  return INFO_MS;
}

export function pushMessage(
  state: MessageState,
  input: MessageInput,
  now: number,
  newId: () => string,
): MessageState {
  const rest = input.key
    ? state.history.filter((m) => m.key !== input.key)
    : state.history;
  const message: Message = {
    ...input,
    id: newId(),
    at: now,
    duration: durationFor(input.kind),
    dismissed: false,
  };
  return { history: [message, ...rest].slice(0, HISTORY_CAP) };
}

/** The message to show now: the newest one that is still up. */
export function visibleMessage(
  state: MessageState,
  now: number,
): Message | null {
  const m = state.history[0];
  if (!m || m.dismissed) return null;
  if (m.duration !== null && now >= m.at + m.duration) return null;
  return m;
}

export function dismissMessage(state: MessageState, id: string): MessageState {
  return {
    history: state.history.map((m) =>
      m.id === id ? { ...m, dismissed: true } : m,
    ),
  };
}

function lineCount(text: string): number {
  return text.replace(/\n+$/, "").split("\n").length;
}

function preview(text: string): string {
  const flat = text.replace(/\s*\n\s*/g, " ").trim();
  return flat.length > PREVIEW_LEN ? `${flat.slice(0, PREVIEW_LEN)}...` : flat;
}

export function copyMessage(text: string, pane: string): string {
  const lines = lineCount(text);
  if (lines > 1) {
    return `${pane} copied ${lines} lines to the clipboard: "${preview(text)}".`;
  }
  return `Copied ${text.length} chars.`;
}

export function pasteMessage(text: string, pane: string): string {
  const lines = lineCount(text);
  const into = pane.toLowerCase();
  return lines > 1
    ? `Pasted ${lines} lines into ${into}.`
    : `Pasted ${text.length} chars into ${into}.`;
}

export function closePaneMessage(pane: string): string {
  return `Closed ${pane.toLowerCase()}.`;
}

export function closeTabMessage(title: string): string {
  return `Closed tab "${title}".`;
}

let seq = 0;
const nextId = () => `msg-${++seq}`;

export const useMessageStore = create<
  MessageState & {
    push: (input: MessageInput) => void;
    dismiss: (id: string) => void;
  }
>((set) => ({
  ...EMPTY,
  push: (input) => set((s) => pushMessage(s, input, Date.now(), nextId)),
  dismiss: (id) => set((s) => dismissMessage(s, id)),
}));

/** Post a message to the top bar. Safe to call from anywhere. */
export function postMessage(input: MessageInput): void {
  useMessageStore.getState().push(input);
}

type PaneLookup = (leafId: number) => { label: string; tabId: number } | null;
let lookupPane: PaneLookup = () => null;

/** App tells the messages how to name a pane ("Pane 2") and find its tab. */
export function setPaneLookup(fn: PaneLookup): void {
  lookupPane = fn;
}

export function describePane(leafId: number): {
  label: string;
  target?: { tabId: number; leafId: number };
} {
  const found = lookupPane(leafId);
  return found
    ? { label: found.label, target: { tabId: found.tabId, leafId } }
    : { label: "The pane" };
}
