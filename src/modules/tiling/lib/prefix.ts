import type { PaneDirection, SplitDir } from "@/modules/terminal/lib/panes";

export type PrefixKey = "ctrl+b" | "ctrl+a" | "ctrl+space";

export type TilingAction =
  | { type: "newTerminal" }
  | { type: "focus"; dir: PaneDirection }
  | { type: "swap"; dir: PaneDirection }
  | { type: "resize"; axis: SplitDir; grow: boolean }
  | { type: "zoom" }
  | { type: "close" }
  | { type: "help" }
  | { type: "sendPrefix" };

export type PrefixState =
  | { mode: "idle" }
  | { mode: "armed" }
  | { mode: "repeat"; key: string; until: number };

/** The parts of a KeyboardEvent the prefix looks at. */
export type KeyInput = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing?: boolean;
};

export type PrefixStep = {
  state: PrefixState;
  action: TilingAction | null;
  /** Stop the key here, so neither the shell nor a global shortcut sees it. */
  consume: boolean;
};

/** How long a resize key keeps repeating without the prefix, like tmux. */
export const REPEAT_MS = 600;
export const IDLE: PrefixState = { mode: "idle" };

const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock"]);
const PREFIX_CHAR: Record<PrefixKey, string> = {
  "ctrl+b": "b",
  "ctrl+a": "a",
  "ctrl+space": " ",
};

function matchesPrefix(e: KeyInput, prefix: PrefixKey): boolean {
  return (
    e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    e.key.toLowerCase() === PREFIX_CHAR[prefix]
  );
}

const FOCUS: Record<string, PaneDirection> = {
  h: "left",
  j: "down",
  k: "up",
  l: "right",
  ArrowLeft: "left",
  ArrowDown: "down",
  ArrowUp: "up",
  ArrowRight: "right",
};
const SWAP: Record<string, PaneDirection> = {
  H: "left",
  J: "down",
  K: "up",
  L: "right",
};
const RESIZE: Record<string, { axis: SplitDir; grow: boolean }> = {
  "<": { axis: "row", grow: false },
  ">": { axis: "row", grow: true },
  "-": { axis: "col", grow: false },
  "+": { axis: "col", grow: true },
  // "+" needs Shift on most layouts; "=" is the same key without it.
  "=": { axis: "col", grow: true },
};

/** The action the key after the prefix asks for, or null for none. */
function actionForKey(e: KeyInput): TilingAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === "Enter") return { type: "newTerminal" };
  if (e.key.startsWith("Arrow") && FOCUS[e.key]) {
    const dir = FOCUS[e.key];
    return e.shiftKey ? { type: "swap", dir } : { type: "focus", dir };
  }
  if (FOCUS[e.key]) return { type: "focus", dir: FOCUS[e.key] };
  if (SWAP[e.key]) return { type: "swap", dir: SWAP[e.key] };
  if (RESIZE[e.key]) return { type: "resize", ...RESIZE[e.key] };
  if (e.key === "z") return { type: "zoom" };
  if (e.key === "x") return { type: "close" };
  if (e.key === "?") return { type: "help" };
  return null;
}

const PASS: PrefixStep = { state: IDLE, action: null, consume: false };

/**
 * One key through the prefix. The prefix arms; the next key runs its action
 * (or cancels, quietly, when it has none); the prefix twice sends the prefix
 * itself to the shell. A resize key keeps working without the prefix while it
 * is pressed again within REPEAT_MS. Outside a terminal tab, or while an input
 * method is composing, the layer stands aside.
 */
export function stepPrefix(
  state: PrefixState,
  e: KeyInput,
  prefix: PrefixKey,
  now: number,
  inTerminalTab: boolean,
): PrefixStep {
  if (!inTerminalTab || e.isComposing) return PASS;
  // Shift on its way to a capital letter must not cancel an armed prefix.
  if (MODIFIERS.has(e.key)) return { state, action: null, consume: false };

  if (state.mode === "repeat") {
    if (now <= state.until && e.key === state.key) {
      const action = actionForKey(e);
      if (action?.type === "resize") {
        return {
          state: { mode: "repeat", key: e.key, until: now + REPEAT_MS },
          action,
          consume: true,
        };
      }
    }
    return stepPrefix(IDLE, e, prefix, now, inTerminalTab);
  }

  if (state.mode === "armed") {
    if (matchesPrefix(e, prefix)) {
      return { state: IDLE, action: { type: "sendPrefix" }, consume: true };
    }
    const action = e.key === "Escape" ? null : actionForKey(e);
    if (action?.type === "resize") {
      return {
        state: { mode: "repeat", key: e.key, until: now + REPEAT_MS },
        action,
        consume: true,
      };
    }
    return { state: IDLE, action, consume: true };
  }

  if (matchesPrefix(e, prefix)) {
    return { state: { mode: "armed" }, action: null, consume: true };
  }
  return PASS;
}
