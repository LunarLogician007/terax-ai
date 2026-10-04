import { describe, expect, it } from "vitest";
import { planTiles, shouldAnimate } from "./tilePlan";

const t = (id: number, x: number, w: number) => ({
  id,
  x,
  y: 0,
  width: w,
  height: 100,
  hidden: false,
});

describe("planTiles", () => {
  it("keys every tile by leaf id so a reshape never recreates a terminal", () => {
    const plan = planTiles([t(1, 0, 200)], [t(1, 0, 97), t(2, 103, 97)], 2, []);
    expect(plan.map((p) => p.key)).toEqual(["leaf-1", "leaf-2"]);
  });

  it("a new tile starts at zero size on its leading edge", () => {
    const plan = planTiles([t(1, 0, 200)], [t(1, 0, 97), t(2, 103, 97)], 2, []);
    expect(plan[1].from).toEqual({ x: 103, y: 0, width: 0, height: 100 });
    expect(plan[0].from).toBeNull();
  });

  it("no entry animation on the first layout", () => {
    expect(planTiles(null, [t(1, 0, 200)], 1, [])[0].from).toBeNull();
  });

  it("marks the focused tile", () => {
    const plan = planTiles(null, [t(1, 0, 97), t(2, 103, 97)], 2, []);
    expect(plan.map((p) => p.focused)).toEqual([false, true]);
  });

  it("keeps a ghost of a closed tile, shrinking to zero", () => {
    const plan = planTiles(
      [t(1, 0, 97), t(2, 103, 97)],
      [t(1, 0, 200)],
      1,
      [2],
    );
    const ghost = plan.find((p) => p.ghost);
    expect(ghost).toMatchObject({
      key: "ghost-2",
      id: 2,
      from: { x: 103, y: 0, width: 97, height: 100 },
    });
    expect(ghost?.rect.width).toBe(0);
  });

  it("a closed tile with no previous rect leaves no ghost", () => {
    expect(planTiles(null, [t(1, 0, 200)], 1, [5]).some((p) => p.ghost)).toBe(
      false,
    );
  });
});

describe("shouldAnimate", () => {
  const base = {
    ready: true,
    animationsOn: true,
    reducedMotion: false,
    sizeChanged: false,
    dragging: false,
  };
  it("animates an ordinary layout change", () => {
    expect(shouldAnimate(base)).toBe(true);
  });
  it("never animates while a divider is dragged, so it follows the pointer", () => {
    expect(shouldAnimate({ ...base, dragging: true })).toBe(false);
  });
  it("is off for a resize of the window, reduced motion, the setting, or no size yet", () => {
    expect(shouldAnimate({ ...base, sizeChanged: true })).toBe(false);
    expect(shouldAnimate({ ...base, reducedMotion: true })).toBe(false);
    expect(shouldAnimate({ ...base, animationsOn: false })).toBe(false);
    expect(shouldAnimate({ ...base, ready: false })).toBe(false);
  });
});
