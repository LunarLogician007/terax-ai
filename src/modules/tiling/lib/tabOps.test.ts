import { describe, expect, it } from "vitest";
import type { TerminalTab } from "@/modules/tabs/lib/useTabs";
import type { PaneNode } from "@/modules/terminal/lib/panes";
import {
  planAdjustDivider,
  planBspSplit,
  planFocusDirection,
  planResize,
  planToggleZoom,
} from "./tabOps";

const leaf = (id: number): PaneNode => ({ kind: "leaf", id });
const tab = (
  paneTree: PaneNode,
  activeLeafId: number,
  extra: Partial<TerminalTab> = {},
): TerminalTab =>
  ({
    id: 1,
    kind: "terminal",
    title: "t",
    paneTree,
    activeLeafId,
    cwd: "/w",
    ...extra,
  }) as TerminalTab;
const tile = (
  id: number,
  x: number,
  y: number,
  width: number,
  height: number,
) => ({
  id,
  x,
  y,
  width,
  height,
  hidden: false,
});
const sizesOf = (n: PaneNode): number[] => {
  if (n.kind !== "split" || !n.sizes) throw new Error("no sizes");
  return n.sizes;
};
const WIDE = { width: 1200, height: 800 };
const IDS = { splitId: 10, leafId: 11 };

describe("planBspSplit", () => {
  it("splits the active leaf side by side on a wide tab and focuses the new one", () => {
    const r = planBspSplit(
      tab(leaf(1), 1),
      IDS,
      WIDE,
      tile(1, 6, 6, 1188, 788),
      6,
    );
    if (!("tab" in r)) throw new Error(`refused: ${r.refused}`);
    expect(r.tab.paneTree).toEqual({
      kind: "split",
      id: 10,
      dir: "row",
      children: [leaf(1), { kind: "leaf", id: 11, cwd: "/w" }],
      sizes: [0.5, 0.5],
    });
    expect(r.tab.activeLeafId).toBe(11);
  });

  it("the second split of the newest pane stacks it (spiral)", () => {
    const first = planBspSplit(
      tab(leaf(1), 1),
      IDS,
      WIDE,
      tile(1, 6, 6, 1188, 788),
      6,
    );
    if (!("tab" in first)) throw new Error("refused");
    const second = planBspSplit(
      first.tab,
      { splitId: 12, leafId: 13 },
      WIDE,
      tile(11, 600, 6, 594, 788),
      6,
    );
    if (!("tab" in second)) throw new Error("refused");
    const root = second.tab.paneTree;
    if (root.kind !== "split") throw new Error("expected a split");
    expect(root.children[1]).toMatchObject({ kind: "split", dir: "col" });
  });

  it("ends a zoom", () => {
    const r = planBspSplit(
      tab(leaf(1), 1, { zoomedLeafId: 1 }),
      IDS,
      WIDE,
      tile(1, 6, 6, 1188, 788),
      6,
    );
    if (!("tab" in r)) throw new Error("refused");
    expect(r.tab.zoomedLeafId).toBeUndefined();
  });

  it("refuses at the pane limit, when there is no room, and in Blocks tabs", () => {
    const four: PaneNode = {
      kind: "split",
      id: 9,
      dir: "row",
      children: [leaf(1), leaf(2), leaf(3), leaf(4)],
    };
    expect(
      planBspSplit(tab(four, 1), IDS, WIDE, tile(1, 0, 0, 300, 800), 6),
    ).toEqual({
      refused: "max",
    });
    expect(
      planBspSplit(tab(leaf(1), 1), IDS, WIDE, tile(1, 0, 0, 200, 800), 6),
    ).toEqual({
      refused: "room",
    });
    expect(
      planBspSplit(
        tab(leaf(1), 1, { blocks: true }),
        IDS,
        WIDE,
        tile(1, 0, 0, 1188, 788),
        6,
      ),
    ).toEqual({ refused: "blocks" });
  });
});

describe("planToggleZoom", () => {
  it("zooms the active leaf, then clears", () => {
    const t = tab(
      { kind: "split", id: 9, dir: "row", children: [leaf(1), leaf(2)] },
      2,
    );
    const z = planToggleZoom(t);
    expect(z.zoomedLeafId).toBe(2);
    expect(planToggleZoom(z).zoomedLeafId).toBeUndefined();
  });

  it("does nothing with one pane", () => {
    const t = tab(leaf(1), 1);
    expect(planToggleZoom(t)).toBe(t);
  });
});

describe("planFocusDirection", () => {
  it("moves focus to the neighbour and ends a zoom", () => {
    const t = tab(
      { kind: "split", id: 9, dir: "row", children: [leaf(1), leaf(2)] },
      1,
      { zoomedLeafId: 1 },
    );
    const next = planFocusDirection(t, "right", [
      tile(1, 0, 0, 500, 600),
      tile(2, 506, 0, 494, 600),
    ]);
    expect(next.activeLeafId).toBe(2);
    expect(next.zoomedLeafId).toBeUndefined();
  });

  it("stays put with no neighbour", () => {
    const t = tab(leaf(1), 1);
    expect(planFocusDirection(t, "left", [tile(1, 0, 0, 500, 600)])).toBe(t);
  });
});

describe("planResize", () => {
  it("grows the active pane by one step", () => {
    const t = tab(
      { kind: "split", id: 9, dir: "row", children: [leaf(1), leaf(2)] },
      1,
    );
    const next = planResize(t, "row", true, [
      {
        splitId: 9,
        index: 1,
        dir: "row",
        rect: { x: 497, y: 6, width: 6, height: 588 },
        span: 982,
      },
    ]);
    expect(sizesOf(next.paneTree)[0]).toBeCloseTo(0.55);
  });

  it("does nothing with no split on that axis", () => {
    const t = tab(
      { kind: "split", id: 9, dir: "row", children: [leaf(1), leaf(2)] },
      1,
    );
    expect(planResize(t, "col", true, [])).toBe(t);
  });
});

describe("planAdjustDivider", () => {
  it("moves a row divider by pixels and clamps at the minimum width", () => {
    const t = tab(
      { kind: "split", id: 9, dir: "row", children: [leaf(1), leaf(2)] },
      1,
    );
    const d = { splitId: 9, index: 1, dir: "row" as const, span: 1000 };
    expect(sizesOf(planAdjustDivider(t, d, 100).paneTree)[0]).toBeCloseTo(0.6);
    expect(sizesOf(planAdjustDivider(t, d, 5000).paneTree)[1]).toBeCloseTo(
      120 / 1000,
    );
  });
});
