import { describe, expect, it, vi } from "vitest";

// The presets matter on macOS, where TOSS Terminal's own "Mod" is Cmd: check them
// against the macOS defaults, not the Ctrl ones the node test env sees.
vi.mock("@/lib/platform", async (orig) => ({
  ...(await orig<typeof import("@/lib/platform")>()),
  IS_MAC: true,
  MOD_PROP: "meta",
}));

describe("presets on macOS", () => {
  it("no two actions share a key in any preset", async () => {
    const { effectiveBindings, PRESET_IDS } = await import("./presets");
    const { SHORTCUTS } = await import("./shortcuts");
    const none = {} as Parameters<typeof effectiveBindings>[1];
    for (const p of PRESET_IDS) {
      const owner = new Map<string, string>();
      for (const s of SHORTCUTS) {
        if (s.id === "tab.selectByIndex") continue;
        for (const b of effectiveBindings(s.id, none, p)) {
          const k = `${b.meta ? "M" : ""}${b.ctrl ? "C" : ""}${b.alt ? "A" : ""}${b.shift ? "S" : ""}+${b.key.toLowerCase()}`;
          expect(
            owner.get(k),
            `${p}: ${k} is bound to ${owner.get(k)} and ${s.id}`,
          ).toBeUndefined();
          owner.set(k, s.id);
        }
      }
    }
  });
});
