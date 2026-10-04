import { describe, expect, it } from "vitest";
import {
  coercePreset,
  effectiveBindings,
  PRESET_IDS,
  type PresetId,
} from "./presets";
import { type KeyBinding, SHORTCUTS, type ShortcutId } from "./shortcuts";

const sig = (b: KeyBinding) =>
  `${b.meta ? "M" : ""}${b.ctrl ? "C" : ""}${b.alt ? "A" : ""}${b.shift ? "S" : ""}+${b.key.toLowerCase()}`;
const none = {} as Record<ShortcutId, KeyBinding[]>;

describe("effectiveBindings", () => {
  it("your own binding wins over the preset, and the preset over the default", () => {
    const mine = { "tiling.zoom": [{ key: "F12" }] } as Record<
      ShortcutId,
      KeyBinding[]
    >;
    expect(effectiveBindings("tiling.zoom", mine, "iterm")).toEqual([
      { key: "F12" },
    ]);
    expect(effectiveBindings("tiling.zoom", none, "iterm")).toEqual([
      { meta: true, shift: true, key: "Enter" },
    ]);
    expect(effectiveBindings("tiling.zoom", none, "custom")).toEqual([]);
  });

  it("Custom is Terax's own defaults", () => {
    for (const s of SHORTCUTS) {
      expect(effectiveBindings(s.id, none, "custom")).toEqual(
        s.defaultBindings,
      );
    }
  });
});

describe("presets", () => {
  it("iTerm2 and Ghostty move pane focus to Cmd+Opt+arrows and swaps to Cmd+Opt+Shift", () => {
    for (const p of ["iterm", "ghostty"] as PresetId[]) {
      expect(effectiveBindings("tiling.focusLeft", none, p)).toEqual([
        { meta: true, alt: true, key: "ArrowLeft" },
      ]);
      expect(effectiveBindings("pane.swapLeft", none, p)).toEqual([
        { meta: true, alt: true, shift: true, key: "ArrowLeft" },
      ]);
      expect(effectiveBindings("tiling.grow", none, p)).toEqual([
        { meta: true, ctrl: true, key: "ArrowRight" },
      ]);
    }
  });

  it("only Ghostty binds equalize (Cmd+Ctrl+=)", () => {
    expect(effectiveBindings("tiling.equalize", none, "ghostty")).toEqual([
      { meta: true, ctrl: true, key: "=" },
    ]);
    expect(effectiveBindings("tiling.equalize", none, "iterm")).toEqual([]);
  });

  it("no two actions share a key in any preset", () => {
    for (const p of PRESET_IDS) {
      const owner = new Map<string, ShortcutId>();
      for (const s of SHORTCUTS) {
        if (s.id === "tab.selectByIndex") continue;
        for (const b of effectiveBindings(s.id, none, p)) {
          const k = sig(b);
          expect(
            owner.get(k),
            `${p}: ${k} is bound to ${owner.get(k)} and ${s.id}`,
          ).toBeUndefined();
          owner.set(k, s.id);
        }
      }
    }
  });

  it("an unknown saved preset falls back to Custom", () => {
    expect(coercePreset("iterm")).toBe("iterm");
    expect(coercePreset("kitty")).toBe("custom");
    expect(coercePreset(undefined)).toBe("custom");
  });
});
