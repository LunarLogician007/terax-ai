import { describe, expect, it } from "vitest";
import {
  clampTilingGap,
  coerceTilingPrefix,
  DEFAULT_PREFERENCES,
} from "./store";

describe("tiling preferences", () => {
  it("defaults match the spec", () => {
    expect(DEFAULT_PREFERENCES).toMatchObject({
      tilingPrefix: "ctrl+b",
      tilingGap: 6,
      tilingTitleBars: true,
      tilingDimUnfocused: true,
      tilingAnimations: true,
    });
  });

  it("coerceTilingPrefix keeps known keys and falls back to ctrl+b", () => {
    expect(coerceTilingPrefix("ctrl+a")).toBe("ctrl+a");
    expect(coerceTilingPrefix("ctrl+space")).toBe("ctrl+space");
    expect(coerceTilingPrefix("cmd+k")).toBe("ctrl+b");
    expect(coerceTilingPrefix(undefined)).toBe("ctrl+b");
  });

  it("clampTilingGap rounds and clamps to 0–24", () => {
    expect(clampTilingGap(8.4)).toBe(8);
    expect(clampTilingGap(-3)).toBe(0);
    expect(clampTilingGap(100)).toBe(24);
    expect(clampTilingGap("x")).toBe(6);
  });
});
