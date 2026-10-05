import { describe, expect, it } from "vitest";
import { translucentByDefault } from "./platformDefaults";

describe("translucentByDefault", () => {
  it("is on for macOS, which blurs what's behind the window", () => {
    expect(translucentByDefault("MacIntel")).toBe(true);
  });

  it("is off where nothing blurs it (Linux, Windows, unknown)", () => {
    expect(translucentByDefault("Linux x86_64")).toBe(false);
    expect(translucentByDefault("Win32")).toBe(false);
    expect(translucentByDefault("")).toBe(false);
  });
});
