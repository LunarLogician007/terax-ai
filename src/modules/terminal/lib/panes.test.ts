import { describe, expect, it } from "vitest";
import {
  directionalLeaf,
  firstLeafSlotId,
  leafIds,
  normalizeSizes,
  removeLeaf,
  sanitizeSizes,
  splitLeaf,
  swapLeafInDirection,
  type PaneNode,
} from "@/modules/terminal/lib/panes";

function row(...ids: number[]): PaneNode {
  return {
    kind: "split",
    id: 100,
    dir: "row",
    children: ids.map((id) => ({ kind: "leaf", id })),
  };
}

function col(...ids: number[]): PaneNode {
  return {
    kind: "split",
    id: 200,
    dir: "col",
    children: ids.map((id) => ({ kind: "leaf", id })),
  };
}

describe("swapLeafInDirection", () => {
  it("swaps the active pane with its neighbor to the left", () => {
    expect(leafIds(swapLeafInDirection(row(1, 2, 3), 2, "left"))).toEqual([
      2, 1, 3,
    ]);
  });

  it("wraps right from the rightmost pane to the leftmost pane", () => {
    expect(leafIds(swapLeafInDirection(row(1, 2, 3), 3, "right"))).toEqual([
      3, 2, 1,
    ]);
  });

  it("swaps vertically and wraps upward", () => {
    expect(leafIds(swapLeafInDirection(col(1, 2, 3), 2, "down"))).toEqual([
      1, 3, 2,
    ]);
    expect(leafIds(swapLeafInDirection(col(1, 2, 3), 1, "up"))).toEqual([
      3, 2, 1,
    ]);
  });

  it("chooses the overlapping directional neighbor in a nested layout", () => {
    const tree: PaneNode = {
      kind: "split",
      id: 10,
      dir: "row",
      children: [
        { kind: "leaf", id: 1 },
        {
          kind: "split",
          id: 11,
          dir: "col",
          children: [
            { kind: "leaf", id: 2 },
            { kind: "leaf", id: 3 },
          ],
        },
      ],
    };

    expect(leafIds(swapLeafInDirection(tree, 2, "down"))).toEqual([1, 3, 2]);
    expect(leafIds(swapLeafInDirection(tree, 3, "left"))).toEqual([3, 2, 1]);
  });

  it("uses live pane bounds after splitters are resized", () => {
    const bounds = [
      { id: 1, left: 0, right: 100, top: 0, bottom: 100 },
      { id: 2, left: 200, right: 300, top: 100, bottom: 200 },
      { id: 3, left: 100, right: 200, top: 0, bottom: 100 },
    ];

    expect(
      leafIds(swapLeafInDirection(row(1, 2, 3), 1, "right", bounds)),
    ).toEqual([3, 2, 1]);
  });

  it("falls back to tree geometry when live bounds are incomplete", () => {
    const tree = row(1, 2, 3);
    const incompleteBounds = [
      { id: 1, left: 0, right: 100, top: 0, bottom: 100 },
    ];

    expect(
      leafIds(swapLeafInDirection(tree, 1, "right", incompleteBounds)),
    ).toEqual([2, 1, 3]);
  });

  it("moves pane metadata with the terminal session", () => {
    const tree: PaneNode = {
      kind: "split",
      id: 100,
      dir: "row",
      children: [
        { kind: "leaf", id: 1, cwd: "/one" },
        { kind: "leaf", id: 2, cwd: "/two" },
      ],
    };
    const swapped = swapLeafInDirection(tree, 2, "left");
    expect(swapped.kind).toBe("split");
    if (swapped.kind === "split") {
      expect(swapped.children[0]).toEqual({
        kind: "leaf",
        id: 2,
        slotId: 1,
        cwd: "/two",
      });
      expect(swapped.children[1]).toEqual({
        kind: "leaf",
        id: 1,
        slotId: 2,
        cwd: "/one",
      });
    }
  });

  it("keeps resizable layout slots fixed while sessions move", () => {
    const tree = row(1, 2, 3);
    const swapped = swapLeafInDirection(tree, 2, "left");

    expect(swapped.kind).toBe("split");
    if (swapped.kind === "split") {
      expect(swapped.children.map(firstLeafSlotId)).toEqual([1, 2, 3]);
      expect(leafIds(swapped)).toEqual([2, 1, 3]);
    }

    const restored = swapLeafInDirection(swapped, 2, "right");
    expect(restored.kind).toBe("split");
    if (restored.kind === "split") {
      expect(restored.children.map(firstLeafSlotId)).toEqual([1, 2, 3]);
      expect(leafIds(restored)).toEqual([1, 2, 3]);
    }
  });

  it("does nothing when the tree contains only one pane", () => {
    const tree: PaneNode = { kind: "leaf", id: 1 };
    expect(swapLeafInDirection(tree, 1, "left")).toBe(tree);
  });
});

describe("split sizes", () => {
  const leaf = (id: number): PaneNode => ({ kind: "leaf", id });
  const sizesOf = (n: PaneNode | null): number[] => {
    if (n?.kind !== "split" || !n.sizes) throw new Error("no sizes");
    return n.sizes;
  };

  it("sanitizeSizes keeps valid shares and normalises them to 1", () => {
    expect(sanitizeSizes([1, 3], 2)).toEqual([0.25, 0.75]);
  });

  it("sanitizeSizes drops sizes of the wrong length or with bad values", () => {
    expect(sanitizeSizes([0.5, 0.5], 3)).toBeUndefined();
    expect(sanitizeSizes([0.5, Number.NaN], 2)).toBeUndefined();
    expect(sanitizeSizes([0.5, 0], 2)).toBeUndefined();
    expect(sanitizeSizes([0.5, -1], 2)).toBeUndefined();
    expect(sanitizeSizes(undefined, 2)).toBeUndefined();
  });

  it("normalizeSizes falls back to equal shares", () => {
    expect(normalizeSizes(undefined, 4)).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(normalizeSizes([2, 2], 3)).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });

  it("removing a child renormalises the remaining shares", () => {
    const tree: PaneNode = {
      kind: "split",
      id: 9,
      dir: "row",
      children: [leaf(1), leaf(2), leaf(3)],
      sizes: [0.5, 0.25, 0.25],
    };
    const next = removeLeaf(tree, 2);
    expect(next).toMatchObject({ kind: "split", children: [leaf(1), leaf(3)] });
    const sizes = sizesOf(next);
    expect(sizes[0]).toBeCloseTo(2 / 3);
    expect(sizes[1]).toBeCloseTo(1 / 3);
  });

  it("removing from a split without sizes adds none", () => {
    const tree: PaneNode = {
      kind: "split",
      id: 9,
      dir: "row",
      children: [leaf(1), leaf(2), leaf(3)],
    };
    expect(removeLeaf(tree, 2)).not.toHaveProperty("sizes");
  });

  it("splitLeaf into a sized split halves the target's share", () => {
    const tree: PaneNode = {
      kind: "split",
      id: 9,
      dir: "row",
      children: [leaf(1), leaf(2)],
      sizes: [0.6, 0.4],
    };
    const next = splitLeaf(tree, 1, 50, 51, "row");
    expect(leafIds(next)).toEqual([1, 51, 2]);
    const sizes = sizesOf(next);
    expect(sizes[0]).toBeCloseTo(0.3);
    expect(sizes[1]).toBeCloseTo(0.3);
    expect(sizes[2]).toBeCloseTo(0.4);
  });

  it("directionalLeaf finds the neighbour from sized rectangles", () => {
    const tree: PaneNode = {
      kind: "split",
      id: 9,
      dir: "row",
      children: [leaf(1), leaf(2)],
      sizes: [0.8, 0.2],
    };
    expect(directionalLeaf(tree, 1, "right")).toBe(2);
    expect(directionalLeaf(tree, 1, "left")).toBeNull();
  });
});
