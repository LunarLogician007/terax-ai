import { describe, expect, it } from "vitest";
import type { PaneNode } from "@/modules/terminal/lib/panes";
import {
  adjustShares,
  findResizeTarget,
  layoutTiles,
  resetShares,
} from "./layout";

const leaf = (id: number): PaneNode => ({ kind: "leaf", id });
const B = { x: 0, y: 0, width: 1000, height: 600 };
const sizesOf = (n: PaneNode): number[] => {
  if (n.kind !== "split" || !n.sizes) throw new Error("no sizes");
  return n.sizes;
};

describe("layoutTiles", () => {
  it("a single pane fills the bounds minus the outer gap", () => {
    const { tiles, dividers } = layoutTiles(leaf(1), B, 6);
    expect(tiles).toEqual([
      { id: 1, x: 6, y: 6, width: 988, height: 588, hidden: false },
    ]);
    expect(dividers).toEqual([]);
  });

  it("two panes side by side share the space with a gap between", () => {
    const tree: PaneNode = {
      kind: "split",
      id: 9,
      dir: "row",
      children: [leaf(1), leaf(2)],
    };
    const { tiles, dividers } = layoutTiles(tree, B, 6);
    const [a, b] = tiles;
    expect(a).toMatchObject({ id: 1, x: 6, y: 6, height: 588 });
    expect(b.x).toBe(a.x + a.width + 6);
    expect(b.x + b.width).toBe(994);
    expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1);
    expect(dividers).toEqual([
      {
        splitId: 9,
        index: 1,
        dir: "row",
        rect: { x: a.x + a.width, y: 6, width: 6, height: 588 },
        span: 982,
      },
    ]);
  });

  it("respects sizes and neighbours share edges exactly", () => {
    const tree: PaneNode = {
      kind: "split",
      id: 9,
      dir: "col",
      children: [leaf(1), leaf(2), leaf(3)],
      sizes: [0.5, 0.3, 0.2],
    };
    const { tiles } = layoutTiles(tree, B, 6);
    expect(tiles[1].y).toBe(tiles[0].y + tiles[0].height + 6);
    expect(tiles[2].y).toBe(tiles[1].y + tiles[1].height + 6);
    expect(tiles[2].y + tiles[2].height).toBe(594);
    expect(tiles[0].height).toBe(Math.round(0.5 * 576));
  });

  it("a zoomed pane fills the area, the others are hidden, no dividers", () => {
    const tree: PaneNode = {
      kind: "split",
      id: 9,
      dir: "row",
      children: [leaf(1), leaf(2)],
    };
    const { tiles, dividers } = layoutTiles(tree, B, 6, 2);
    expect(tiles.find((t) => t.id === 2)).toEqual({
      id: 2,
      x: 6,
      y: 6,
      width: 988,
      height: 588,
      hidden: false,
    });
    expect(tiles.find((t) => t.id === 1)?.hidden).toBe(true);
    expect(dividers).toEqual([]);
  });

  it("a zoom on a leaf that is gone is ignored", () => {
    const { tiles } = layoutTiles(leaf(1), B, 6, 5);
    expect(tiles[0].hidden).toBe(false);
  });

  it("a zero-size area gives zero-size tiles, never negative", () => {
    const { tiles } = layoutTiles(
      { kind: "split", id: 9, dir: "row", children: [leaf(1), leaf(2)] },
      { x: 0, y: 0, width: 0, height: 0 },
      6,
    );
    for (const t of tiles) {
      expect(t.width).toBeGreaterThanOrEqual(0);
      expect(t.height).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("adjustShares", () => {
  const tree: PaneNode = {
    kind: "split",
    id: 9,
    dir: "row",
    children: [leaf(1), leaf(2)],
  };

  it("moves the boundary between two children", () => {
    const sizes = sizesOf(adjustShares(tree, 9, 1, 0.1, 0.1));
    expect(sizes[0]).toBeCloseTo(0.6);
    expect(sizes[1]).toBeCloseTo(0.4);
  });

  it("adjustShares clamps at the minimum share", () => {
    const next = adjustShares(tree, 9, 1, 5, 0.2);
    expect(sizesOf(next)[0]).toBeCloseTo(0.8);
    expect(sizesOf(next)[1]).toBeCloseTo(0.2);
    const back = adjustShares(next, 9, 1, -50, 0.2);
    expect(sizesOf(back)[0]).toBeCloseTo(0.2);
    expect(sizesOf(back)[1]).toBeCloseTo(0.8);
  });

  it("returns the same tree for an unknown split or bad index", () => {
    expect(adjustShares(tree, 7, 1, 0.1, 0.1)).toBe(tree);
    expect(adjustShares(tree, 9, 0, 0.1, 0.1)).toBe(tree);
    expect(adjustShares(tree, 9, 2, 0.1, 0.1)).toBe(tree);
  });

  it("resetShares removes sizes", () => {
    const sized = adjustShares(tree, 9, 1, 0.1, 0.1);
    expect(resetShares(sized, 9)).not.toHaveProperty("sizes");
  });
});

describe("findResizeTarget", () => {
  const tree: PaneNode = {
    kind: "split",
    id: 9,
    dir: "row",
    children: [
      leaf(1),
      { kind: "split", id: 8, dir: "col", children: [leaf(2), leaf(3)] },
    ],
  };

  it("growing the first child moves its right boundary", () => {
    expect(findResizeTarget(tree, 1, "row", true)).toEqual({
      splitId: 9,
      index: 1,
      sign: 1,
    });
  });

  it("growing the last child moves its left boundary", () => {
    expect(findResizeTarget(tree, 2, "row", true)).toEqual({
      splitId: 9,
      index: 1,
      sign: -1,
    });
  });

  it("uses the nearest split on the asked axis", () => {
    expect(findResizeTarget(tree, 3, "col", false)).toEqual({
      splitId: 8,
      index: 1,
      sign: 1,
    });
  });

  it("is null with no split on that axis", () => {
    expect(findResizeTarget(tree, 1, "col", true)).toBeNull();
  });
});
