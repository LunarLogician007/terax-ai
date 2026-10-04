import { describe, expect, it } from "vitest";
import { downsample } from "./resample";

describe("downsample", () => {
  it("48 kHz to 16 kHz averages each group of three samples", () => {
    const out = downsample(
      Float32Array.from([0, 0.3, 0.6, 1, 1, 1]),
      48_000,
      16_000,
    );
    expect(Array.from(out).map((v) => +v.toFixed(3))).toEqual([0.3, 1]);
  });

  it("handles a rate that doesn't divide evenly (44.1 kHz)", () => {
    const out = downsample(new Float32Array(44_100).fill(0.5), 44_100, 16_000);
    expect(out.length).toBe(16_000);
    expect(out.every((v) => Math.abs(v - 0.5) < 1e-6)).toBe(true);
  });

  it("passes 16 kHz through, and an empty buffer stays empty", () => {
    const same = Float32Array.from([0.1, 0.2]);
    expect(Array.from(downsample(same, 16_000, 16_000))).toEqual(
      Array.from(same),
    );
    expect(downsample(new Float32Array(0), 48_000, 16_000).length).toBe(0);
  });
});
