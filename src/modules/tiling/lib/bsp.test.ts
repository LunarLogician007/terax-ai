import { describe, expect, it } from "vitest";
import type { PaneNode } from "@/modules/terminal/lib/panes";
import { leafDepth, spiralDirection, splitLeafBinary } from "./bsp";

const leaf = (id: number): PaneNode => ({ kind: "leaf", id });

describe("spiralDirection", () => {
  it("starts side by side on a wide tab and stacked on a tall one", () => {
    expect(spiralDirection(0, 1200, 800)).toBe("row");
    expect(spiralDirection(0, 600, 900)).toBe("col");
  });

  it("alternates with depth", () => {
    expect(spiralDirection(1, 1200, 800)).toBe("col");
    expect(spiralDirection(2, 1200, 800)).toBe("row");
    expect(spiralDirection(1, 600, 900)).toBe("row");
  });
});

describe("leafDepth", () => {
  it("is 0 for a lone leaf and counts splits above a leaf", () => {
    expect(leafDepth(leaf(1), 1)).toBe(0);
    const tree: PaneNode = {
      kind: "split",
      id: 9,
      dir: "row",
      children: [
        leaf(1),
        { kind: "split", id: 8, dir: "col", children: [leaf(2), leaf(3)] },
      ],
    };
    expect(leafDepth(tree, 1)).toBe(1);
    expect(leafDepth(tree, 3)).toBe(2);
    expect(leafDepth(tree, 7)).toBeNull();
  });
});

describe("splitLeafBinary", () => {
  it("wraps the target in a 50/50 two-child split", () => {
    expect(splitLeafBinary(leaf(1), 1, 10, 11, "row", "/tmp")).toEqual({
      kind: "split",
      id: 10,
      dir: "row",
      children: [leaf(1), { kind: "leaf", id: 11, cwd: "/tmp" }],
      sizes: [0.5, 0.5],
    });
  });

  it("splits in two even when the parent runs the same way", () => {
    const tree: PaneNode = {
      kind: "split",
      id: 9,
      dir: "row",
      children: [leaf(1), leaf(2)],
    };
    expect(splitLeafBinary(tree, 2, 10, 11, "row")).toEqual({
      kind: "split",
      id: 9,
      dir: "row",
      children: [
        leaf(1),
        {
          kind: "split",
          id: 10,
          dir: "row",
          children: [leaf(2), leaf(11)],
          sizes: [0.5, 0.5],
        },
      ],
    });
  });

  it("returns the same tree when the target is missing", () => {
    const tree: PaneNode = {
      kind: "split",
      id: 9,
      dir: "row",
      children: [leaf(1), leaf(2)],
    };
    expect(splitLeafBinary(tree, 7, 10, 11, "row")).toBe(tree);
  });
});
