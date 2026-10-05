import { describe, expect, it } from "vitest";
import {
  IDLE,
  type KeyInput,
  type PrefixState,
  REPEAT_MS,
  stepPrefix,
} from "./prefix";

const k = (key: string, mods: Partial<KeyInput> = {}): KeyInput => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});
const CB = k("b", { ctrlKey: true });
const step = (s: PrefixState, e: KeyInput, now = 0, inTerm = true) =>
  stepPrefix(s, e, "ctrl+b", now, inTerm);

describe("stepPrefix", () => {
  it("arms on Ctrl+B and consumes it", () => {
    expect(step(IDLE, CB)).toEqual({
      state: { mode: "armed" },
      action: null,
      consume: true,
    });
  });

  it("lets ordinary keys through when idle", () => {
    expect(step(IDLE, k("h"))).toEqual({
      state: IDLE,
      action: null,
      consume: false,
    });
  });

  it("runs a mapped key and disarms", () => {
    const armed = step(IDLE, CB).state;
    expect(step(armed, k("Enter"))).toEqual({
      state: IDLE,
      action: { type: "newTerminal" },
      consume: true,
    });
    expect(step(armed, k("h")).action).toEqual({ type: "focus", dir: "left" });
    expect(step(armed, k("ArrowDown")).action).toEqual({
      type: "focus",
      dir: "down",
    });
    expect(step(armed, k("L", { shiftKey: true })).action).toEqual({
      type: "swap",
      dir: "right",
    });
    expect(step(armed, k("ArrowUp", { shiftKey: true })).action).toEqual({
      type: "swap",
      dir: "up",
    });
    expect(step(armed, k("z")).action).toEqual({ type: "zoom" });
    expect(step(armed, k("x")).action).toEqual({ type: "close" });
    expect(step(armed, k("?", { shiftKey: true })).action).toEqual({
      type: "help",
    });
  });

  it("modifier-only keys keep the prefix armed", () => {
    const armed = step(IDLE, CB).state;
    const shift = step(armed, k("Shift", { shiftKey: true }));
    expect(shift).toEqual({
      state: { mode: "armed" },
      action: null,
      consume: false,
    });
    expect(step(shift.state, k("H", { shiftKey: true })).action).toEqual({
      type: "swap",
      dir: "left",
    });
  });

  it("Ctrl+B twice sends the prefix through", () => {
    const armed = step(IDLE, CB).state;
    expect(step(armed, CB)).toEqual({
      state: IDLE,
      action: { type: "sendPrefix" },
      consume: true,
    });
  });

  it("Esc and unknown keys disarm and send nothing", () => {
    const armed = step(IDLE, CB).state;
    const none = { state: IDLE, action: null, consume: true };
    expect(step(armed, k("Escape"))).toEqual(none);
    expect(step(armed, k("q"))).toEqual(none);
    expect(step(armed, k("h", { metaKey: true }))).toEqual(none);
  });

  it("a resize key repeats without the prefix inside the window", () => {
    const armed = step(IDLE, CB, 0).state;
    const first = step(armed, k(">", { shiftKey: true }), 100);
    expect(first.action).toEqual({ type: "resize", axis: "row", grow: true });
    expect(first.state).toEqual({
      mode: "repeat",
      key: ">",
      until: 100 + REPEAT_MS,
    });
    const again = step(first.state, k(">", { shiftKey: true }), 500);
    expect(again.action).toEqual({ type: "resize", axis: "row", grow: true });
    expect(again.state).toEqual({
      mode: "repeat",
      key: ">",
      until: 500 + REPEAT_MS,
    });
  });

  it("the repeat ends after the window or on another key", () => {
    const rep: PrefixState = { mode: "repeat", key: "{", until: 600 };
    const pass = { state: IDLE, action: null, consume: false };
    expect(step(rep, k("{"), 700)).toEqual(pass);
    expect(step(rep, k("a"), 100)).toEqual(pass);
    expect(step(rep, CB, 100).state).toEqual({ mode: "armed" });
  });

  it("maps the resize keys the tuios way", () => {
    const armed = step(IDLE, CB).state;
    expect(step(armed, k("<", { shiftKey: true })).action).toEqual({
      type: "resize",
      axis: "row",
      grow: false,
    });
    expect(step(armed, k("{", { shiftKey: true })).action).toEqual({
      type: "resize",
      axis: "col",
      grow: false,
    });
    expect(step(armed, k("}", { shiftKey: true })).action).toEqual({
      type: "resize",
      axis: "col",
      grow: true,
    });
  });

  it("ignores keys outside terminal tabs and while composing", () => {
    const pass = { state: IDLE, action: null, consume: false };
    expect(step(IDLE, CB, 0, false)).toEqual(pass);
    expect(step(IDLE, { ...CB, isComposing: true })).toEqual(pass);
    const armed = step(IDLE, CB).state;
    expect(step(armed, k("h"), 0, false)).toEqual(pass);
  });

  it("supports Ctrl+A and Ctrl+Space as the prefix", () => {
    expect(
      stepPrefix(IDLE, k("a", { ctrlKey: true }), "ctrl+a", 0, true).state,
    ).toEqual({ mode: "armed" });
    expect(
      stepPrefix(IDLE, k(" ", { ctrlKey: true }), "ctrl+space", 0, true).state,
    ).toEqual({ mode: "armed" });
    expect(stepPrefix(IDLE, CB, "ctrl+a", 0, true).consume).toBe(false);
  });
});

describe("prefix on macOS WebKit", () => {
  // Under Control, WebKit can report the control character as `key`;
  // the physical key in `code` is the reliable part (toss's own terminal
  // input reads `code` for modified keys for the same reason).
  it("arms on Ctrl+B reported as a control character with code KeyB", () => {
    const e = k("\u0002", { ctrlKey: true, code: "KeyB" });
    expect(step(IDLE, e).state).toEqual({ mode: "armed" });
  });
  it("sends the prefix through when the second Ctrl+B is a control character", () => {
    const armed = step(IDLE, CB).state;
    const e = k("\u0002", { ctrlKey: true, code: "KeyB" });
    expect(step(armed, e).action).toEqual({ type: "sendPrefix" });
  });
  it("matches Ctrl+A and Ctrl+Space by code too", () => {
    expect(
      stepPrefix(
        IDLE,
        k("\u0001", { ctrlKey: true, code: "KeyA" }),
        "ctrl+a",
        0,
        true,
      ).state,
    ).toEqual({ mode: "armed" });
    expect(
      stepPrefix(
        IDLE,
        k("\u0000", { ctrlKey: true, code: "Space" }),
        "ctrl+space",
        0,
        true,
      ).state,
    ).toEqual({ mode: "armed" });
  });
  it("does not arm on Ctrl with a different physical key", () => {
    expect(
      step(IDLE, k("\u0002", { ctrlKey: true, code: "KeyN" })).consume,
    ).toBe(false);
  });
});

describe("second key with Control still held", () => {
  // Pressing Ctrl+B and then the next key without letting go of Control is
  // natural; under Control macOS WebKit may also report a control character.
  it("Ctrl+Enter after the prefix still opens a terminal", () => {
    const armed = step(IDLE, CB).state;
    expect(
      step(armed, k("Enter", { ctrlKey: true, code: "Enter" })).action,
    ).toEqual({
      type: "newTerminal",
    });
  });
  it("Ctrl+h (as a control character) still focuses left", () => {
    const armed = step(IDLE, CB).state;
    expect(
      step(armed, k("\u0008", { ctrlKey: true, code: "KeyH" })).action,
    ).toEqual({
      type: "focus",
      dir: "left",
    });
  });
  it("Ctrl+Shift+L still swaps right", () => {
    const armed = step(IDLE, CB).state;
    expect(
      step(armed, k("\u000c", { ctrlKey: true, shiftKey: true, code: "KeyL" }))
        .action,
    ).toEqual({ type: "swap", dir: "right" });
  });
  it("Cmd or Option on the second key still cancels", () => {
    const armed = step(IDLE, CB).state;
    expect(
      step(armed, k("h", { metaKey: true, code: "KeyH" })).action,
    ).toBeNull();
    expect(
      step(armed, k("h", { altKey: true, code: "KeyH" })).action,
    ).toBeNull();
  });
});

describe("tuios prefix bindings", () => {
  const armed = () => step(IDLE, CB).state;

  it("- splits stacked and | or \\ split side by side", () => {
    expect(step(armed(), k("-")).action).toEqual({ type: "split", dir: "col" });
    expect(step(armed(), k("|", { shiftKey: true })).action).toEqual({
      type: "split",
      dir: "row",
    });
    expect(step(armed(), k("\\")).action).toEqual({
      type: "split",
      dir: "row",
    });
  });

  it("c opens a new terminal, like tuios's new window", () => {
    expect(step(armed(), k("c")).action).toEqual({ type: "newTerminal" });
  });

  it("n / Tab cycle forward and p / Shift+Tab back", () => {
    expect(step(armed(), k("n")).action).toEqual({ type: "cycle", delta: 1 });
    expect(step(armed(), k("Tab")).action).toEqual({ type: "cycle", delta: 1 });
    expect(step(armed(), k("p")).action).toEqual({ type: "cycle", delta: -1 });
    expect(step(armed(), k("Tab", { shiftKey: true })).action).toEqual({
      type: "cycle",
      delta: -1,
    });
  });

  it("= equalizes and R rotates", () => {
    expect(step(armed(), k("=")).action).toEqual({ type: "equalize" });
    expect(step(armed(), k("R", { shiftKey: true })).action).toEqual({
      type: "rotate",
    });
  });

  it("arrows keep moving focus without the prefix inside the window, like tuios", () => {
    const first = step(armed(), k("ArrowRight"), 100);
    expect(first.action).toEqual({ type: "focus", dir: "right" });
    expect(first.state).toEqual({
      mode: "repeat",
      key: "ArrowRight",
      until: 100 + REPEAT_MS,
    });
    const next = step(first.state, k("ArrowRight"), 300);
    expect(next.action).toEqual({ type: "focus", dir: "right" });
  });
});

describe("dictation after the prefix", () => {
  const armed = { mode: "armed" } as const;
  it("Ctrl+Space, as WebKit reports it under Control, dictates", () => {
    for (const key of [" ", "\u0000"]) {
      expect(
        step(armed, k(key, { code: "Space", ctrlKey: true })).action,
      ).toEqual({
        type: "dictate",
      });
    }
  });

  it("plain Space and v dictate too", () => {
    expect(step(armed, k(" ", { code: "Space" })).action).toEqual({
      type: "dictate",
    });
    expect(step(armed, k("v", { code: "KeyV" })).action).toEqual({
      type: "dictate",
    });
    expect(
      step(armed, k("\u0016", { code: "KeyV", ctrlKey: true })).action,
    ).toEqual({
      type: "dictate",
    });
  });

  it("with Ctrl+Space as the prefix, pressing it twice still sends it to the shell", () => {
    const sp = k(" ", { code: "Space", ctrlKey: true });
    const armedSp = stepPrefix(IDLE, sp, "ctrl+space", 0, true).state;
    expect(stepPrefix(armedSp, sp, "ctrl+space", 0, true).action).toEqual({
      type: "sendPrefix",
    });
    expect(
      stepPrefix(armedSp, k("v", { code: "KeyV" }), "ctrl+space", 0, true)
        .action,
    ).toEqual({ type: "dictate" });
  });
});
