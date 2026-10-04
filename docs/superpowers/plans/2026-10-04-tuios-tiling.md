# tuios Tiling for Terax: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to carry out this plan task by task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Terminal tabs in terax tile like tuios. New terminals are placed by
BSP; panes are drawn as windows with gaps, rounded corners and title bars;
open, close, swap and zoom are animated; and a Ctrl+B prefix drives the keys.

**Architecture:** terax's `PaneNode` tree stays the model and gains split
`sizes`. Pure functions in `src/modules/tiling/lib/` cover BSP placement,
pixel layout, resizing, tab operations and the prefix state machine.
`TiledLayout` replaces the nested resizable panels with a flat list of
absolutely positioned `TileWindow`s, keyed by leaf ID. While an animation
runs, terax's existing terminal-resize-interaction guard holds terminals at
their old size, so each one is refitted once at the end.

**Tech stack:** React 19, TypeScript, zustand, vitest, Tailwind, Tauri 2.

**Spec:** `docs/superpowers/specs/2026-10-04-tuios-tiling-design.md`

## Global constraints

- Tiling applies only to terminal tabs. Editor, markdown and preview tabs are
  unchanged.
- BSP is the only layout. The spiral rule decides the axis: even depth uses
  `row` when the tab is at least as wide as it is tall, `col` otherwise; odd
  depth uses the other axis. Every split is 50/50.
- The default prefix is Ctrl+B. The other choices are Ctrl+A and Ctrl+Space.
  The resize-repeat window is 600 ms.
- The default gap is 6 px, allowed range 0–24. Minimum window content is
  120 × 60 px. A keyboard resize step is 5% of the split.
- Animation timing uses `var(--dur-base)` and `var(--ease-premium)`.
  Animations turn off under `prefers-reduced-motion: reduce` or when the
  Animations setting is off.
- terax's existing `MAX_PANES_PER_TAB = 4` stays in force. A split past it is
  refused with a toast.
- Spaces saved by stock terax (no `sizes`) must load unchanged.
- Every edited upstream file gets the header comment
  `// Modified for Terax Tiling (tuios-style tiling), 2026.`
- Tests follow terax's own pattern: vitest, node environment, pure logic, no
  DOM test library. Rendering behaviour is checked in the built app.
- Every task finishes with `pnpm test`, `pnpm check-types` and `pnpm lint`
  green. Lint must have 0 errors; the baseline has 90 warnings that were
  already there.

## Review focus

The cases most likely to bite a real user that the spec implies but doesn't
spell out. Each has a test in the task named after the arrow.

1. **Shift pressed before a capital letter while the prefix is armed.**
   Pressing Shift (to type `H`) must not cancel the prefix → Task 5,
   "modifier-only keys keep the prefix armed".
2. **A Space saved by stock terax, or with corrupted `sizes`.** It must load
   with equal splits, not crash or skew → Task 4,
   "drops sizes of the wrong length or with bad values".
3. **Closing a pane in a split that has custom sizes.** The remaining panes
   must keep their proportions and fill the space → Task 1,
   "removing a child renormalises the remaining shares".
4. **A resize pushing a pane past the minimum, or repeated far past it.** It
   must clamp at the minimum and never go negative → Task 3,
   "adjustShares clamps at the minimum share".
5. **Ctrl+B pressed in an editor or markdown tab, or while composing with an
   input method.** It must pass through untouched → Task 5,
   "ignores keys outside terminal tabs and while composing".

---

### Task 1: Toolchain, baseline and split `sizes` in the pane model

**Files:**
- Modify: `src/modules/terminal/lib/panes.ts`
- Test: `src/modules/terminal/lib/panes.test.ts` (add cases)

**Interfaces:**
- Produces:
  - `PaneNode` split variant `{ kind: "split"; id; dir; children; sizes?: number[] }`
  - `sanitizeSizes(sizes: readonly number[] | undefined, count: number): number[] | undefined`
  - `normalizeSizes(sizes: readonly number[] | undefined, count: number): number[]`
  - `directionalLeaf(tree: PaneNode, activeId: PaneId, direction: PaneDirection, liveBounds?: PaneBounds[]): PaneId | null`
  - `removeLeaf` and `splitLeaf` keep `sizes` consistent.

- [x] **Step 0: Toolchain.** Install Node and `pnpm@11.9.0`, run
  `pnpm install --frozen-lockfile`, and record the baseline: 1209 tests pass,
  `tsc` is clean, lint shows 0 errors and 90 warnings.

- [ ] **Step 1: Write the failing tests.** Add them to `panes.test.ts`:

```ts
import {
  directionalLeaf,
  normalizeSizes,
  removeLeaf,
  sanitizeSizes,
  splitLeaf,
} from "@/modules/terminal/lib/panes";

describe("split sizes", () => {
  const leaf = (id: number): PaneNode => ({ kind: "leaf", id });

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
      kind: "split", id: 9, dir: "row",
      children: [leaf(1), leaf(2), leaf(3)], sizes: [0.5, 0.25, 0.25],
    };
    const next = removeLeaf(tree, 2);
    expect(next).toMatchObject({ kind: "split", children: [leaf(1), leaf(3)] });
    const sizes = (next as Extract<PaneNode, { kind: "split" }>).sizes!;
    expect(sizes[0]).toBeCloseTo(2 / 3);
    expect(sizes[1]).toBeCloseTo(1 / 3);
  });

  it("removing from a split without sizes adds none", () => {
    const tree: PaneNode = {
      kind: "split", id: 9, dir: "row", children: [leaf(1), leaf(2), leaf(3)],
    };
    expect(removeLeaf(tree, 2)).not.toHaveProperty("sizes");
  });

  it("splitLeaf into a sized split halves the target's share", () => {
    const tree: PaneNode = {
      kind: "split", id: 9, dir: "row", children: [leaf(1), leaf(2)], sizes: [0.6, 0.4],
    };
    const next = splitLeaf(tree, 1, 50, 51, "row") as Extract<PaneNode, { kind: "split" }>;
    expect(next.children.map((c) => c.id)).toEqual([1, 51, 2]);
    expect(next.sizes![0]).toBeCloseTo(0.3);
    expect(next.sizes![1]).toBeCloseTo(0.3);
    expect(next.sizes![2]).toBeCloseTo(0.4);
  });

  it("directionalLeaf finds the neighbour from sized rectangles", () => {
    const tree: PaneNode = {
      kind: "split", id: 9, dir: "row", children: [leaf(1), leaf(2)], sizes: [0.8, 0.2],
    };
    expect(directionalLeaf(tree, 1, "right")).toBe(2);
    expect(directionalLeaf(tree, 1, "left")).toBeNull();
  });
});
```

- [ ] **Step 2: Watch them fail.**
  Run `pnpm vitest run src/modules/terminal/lib/panes.test.ts`. Expected: they
  fail with "sanitizeSizes is not a function", plus the same for the others.

- [ ] **Step 3: Implement.** In `panes.ts`:
  - add `sizes?: number[]` to the split variant;
  - add the two size helpers;
  - make `removeLeaf` and `splitLeaf` keep shares;
  - make `paneRects` follow shares;
  - export `directionalLeaf`, and have `swapLeafInDirection` use it.

```ts
/** Valid shares for `count` children, normalised to sum 1, or undefined. */
export function sanitizeSizes(
  sizes: readonly number[] | undefined,
  count: number,
): number[] | undefined {
  if (!sizes || sizes.length !== count || count === 0) return undefined;
  if (!sizes.every((s) => Number.isFinite(s) && s > 0)) return undefined;
  const total = sizes.reduce((a, b) => a + b, 0);
  return sizes.map((s) => s / total);
}

/** `sizes` when valid for `count` children, equal shares otherwise. */
export function normalizeSizes(
  sizes: readonly number[] | undefined,
  count: number,
): number[] {
  return (
    sanitizeSizes(sizes, count) ??
    Array.from({ length: count }, () => 1 / count)
  );
}
```

`removeLeaf`, keeping shares:

```ts
export function removeLeaf(tree: PaneNode, targetId: PaneId): PaneNode | null {
  if (isLeaf(tree)) return tree.id === targetId ? null : tree;
  const shares = tree.sizes
    ? normalizeSizes(tree.sizes, tree.children.length)
    : null;
  const newChildren: PaneNode[] = [];
  const kept: number[] = [];
  tree.children.forEach((c, i) => {
    const r = removeLeaf(c, targetId);
    if (r === null) return;
    newChildren.push(r);
    if (shares) kept.push(shares[i]);
  });
  if (newChildren.length === 0) return null;
  if (newChildren.length === 1) return newChildren[0];
  const { sizes: _drop, ...rest } = tree;
  return shares
    ? { ...rest, children: newChildren, sizes: normalizeSizes(kept, newChildren.length) }
    : { ...rest, children: newChildren };
}
```

In `splitLeaf`'s same-direction branch, when `tree.sizes` is set, give the new
leaf half of the target's share:

```ts
      const shares = tree.sizes
        ? normalizeSizes(tree.sizes, tree.children.length)
        : null;
      return {
        ...tree,
        children: [
          ...tree.children.slice(0, idx + 1),
          newLeaf,
          ...tree.children.slice(idx + 1),
        ],
        ...(shares && {
          sizes: [
            ...shares.slice(0, idx),
            shares[idx] / 2,
            shares[idx] / 2,
            ...shares.slice(idx + 1),
          ],
        }),
      };
```

`paneRects` follows shares:

```ts
function paneRects(node: PaneNode, x = 0, y = 0, width = 1, height = 1): PaneRect[] {
  if (isLeaf(node)) return [{ id: node.id, x, y, width, height }];
  const shares = normalizeSizes(node.sizes, node.children.length);
  let offset = 0;
  return node.children.flatMap((child, index) => {
    const start = offset;
    offset += shares[index];
    return node.dir === "row"
      ? paneRects(child, x + width * start, y, width * shares[index], height)
      : paneRects(child, x, y + height * start, width, height * shares[index]);
  });
}
```

`directionalLeaf`, with `swapLeafInDirection` built on it:

```ts
export function directionalLeaf(
  tree: PaneNode,
  activeId: PaneId,
  direction: PaneDirection,
  liveBounds?: PaneBounds[],
): PaneId | null {
  const liveRects = liveBounds ? rectsFromBounds(liveBounds) : [];
  const liveIds = new Set(liveRects.map((rect) => rect.id));
  const complete = leafIds(tree).every((id) => liveIds.has(id));
  const rects = complete ? liveRects : paneRects(tree);
  const active = rects.find((rect) => rect.id === activeId);
  if (!active || rects.length < 2) return null;
  return directionalTarget(rects, active, direction);
}

export function swapLeafInDirection(
  tree: PaneNode,
  activeId: PaneId,
  direction: PaneDirection,
  liveBounds?: PaneBounds[],
): PaneNode {
  const targetId = directionalLeaf(tree, activeId, direction, liveBounds);
  if (targetId === null) return tree;
  const first = findLeaf(tree, activeId);
  const second = findLeaf(tree, targetId);
  return first && second ? swapLeaves(tree, first, second) : tree;
}
```

Add the "Modified for Terax Tiling" header at the top of `panes.ts`.

- [ ] **Step 4: Run.** `pnpm vitest run src/modules/terminal/lib/panes.test.ts`
  passes, then `pnpm test`, `pnpm check-types` and `pnpm lint`.

- [ ] **Step 5: Commit.**
  `git add src/modules/terminal/lib/panes.ts src/modules/terminal/lib/panes.test.ts`
  then `git commit -m "feat(tiling): split sizes in the pane model"`

---

### Task 2: BSP placement (spiral)

**Files:**
- Create: `src/modules/tiling/lib/bsp.ts`
- Create: `src/modules/tiling/lib/bsp.test.ts`

**Interfaces:**
- Consumes: `PaneNode`, `PaneId`, `SplitDir`, `isLeaf` from `panes.ts`.
- Produces:
  - `leafDepth(tree: PaneNode, id: PaneId): number | null`
  - `spiralDirection(depth: number, width: number, height: number): SplitDir`
  - `splitLeafBinary(tree, targetId, newSplitId, newLeafId, dir, newCwd?): PaneNode`

- [ ] **Step 1: Write the failing tests** (`bsp.test.ts`).

```ts
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
      kind: "split", id: 9, dir: "row",
      children: [leaf(1), { kind: "split", id: 8, dir: "col", children: [leaf(2), leaf(3)] }],
    };
    expect(leafDepth(tree, 1)).toBe(1);
    expect(leafDepth(tree, 3)).toBe(2);
    expect(leafDepth(tree, 7)).toBeNull();
  });
});

describe("splitLeafBinary", () => {
  it("wraps the target in a 50/50 two-child split", () => {
    expect(splitLeafBinary(leaf(1), 1, 10, 11, "row", "/tmp")).toEqual({
      kind: "split", id: 10, dir: "row",
      children: [leaf(1), { kind: "leaf", id: 11, cwd: "/tmp" }],
      sizes: [0.5, 0.5],
    });
  });
  it("splits in two even when the parent runs the same way", () => {
    const tree: PaneNode = {
      kind: "split", id: 9, dir: "row", children: [leaf(1), leaf(2)],
    };
    const next = splitLeafBinary(tree, 2, 10, 11, "row");
    expect(next).toEqual({
      kind: "split", id: 9, dir: "row",
      children: [
        leaf(1),
        { kind: "split", id: 10, dir: "row", children: [leaf(2), leaf(11)], sizes: [0.5, 0.5] },
      ],
    });
  });
  it("returns the same tree when the target is missing", () => {
    const tree: PaneNode = { kind: "split", id: 9, dir: "row", children: [leaf(1), leaf(2)] };
    expect(splitLeafBinary(tree, 7, 10, 11, "row")).toBe(tree);
  });
});
```

- [ ] **Step 2: Watch them fail.** Run
  `pnpm vitest run src/modules/tiling/lib/bsp.test.ts`. Expected: FAIL, the
  module can't be resolved.

- [ ] **Step 3: Implement** `bsp.ts`.

```ts
import {
  isLeaf,
  type PaneId,
  type PaneNode,
  type SplitDir,
} from "@/modules/terminal/lib/panes";

/** How many splits sit above leaf `id`, or null when it isn't in the tree. */
export function leafDepth(tree: PaneNode, id: PaneId, depth = 0): number | null {
  if (isLeaf(tree)) return tree.id === id ? depth : null;
  for (const child of tree.children) {
    const d = leafDepth(child, id, depth + 1);
    if (d !== null) return d;
  }
  return null;
}

/**
 * tuios's default "spiral": the axis alternates with the depth of the pane
 * being split. Where the alternation starts follows the tab's shape, so a tall
 * tab isn't cut into two narrow columns on its first split.
 */
export function spiralDirection(depth: number, width: number, height: number): SplitDir {
  const even: SplitDir = width >= height ? "row" : "col";
  if (depth % 2 === 0) return even;
  return even === "row" ? "col" : "row";
}

/** Replace leaf `targetId` with a 50/50 split of it and a new leaf. */
export function splitLeafBinary(
  tree: PaneNode,
  targetId: PaneId,
  newSplitId: PaneId,
  newLeafId: PaneId,
  dir: SplitDir,
  newCwd?: string,
): PaneNode {
  if (isLeaf(tree)) {
    if (tree.id !== targetId) return tree;
    const fresh: PaneNode = {
      kind: "leaf",
      id: newLeafId,
      ...(newCwd !== undefined && { cwd: newCwd }),
    };
    return { kind: "split", id: newSplitId, dir, children: [tree, fresh], sizes: [0.5, 0.5] };
  }
  let changed = false;
  const children = tree.children.map((child) => {
    const next = splitLeafBinary(child, targetId, newSplitId, newLeafId, dir, newCwd);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...tree, children } : tree;
}
```

- [ ] **Step 4: Run.** The `bsp.test.ts` tests pass, then the full checks.

- [ ] **Step 5: Commit.**
  `git commit -m "feat(tiling): BSP spiral placement"` (with both files added).

---

### Task 3: Pixel layout, dividers and resizing

**Files:**
- Create: `src/modules/tiling/lib/layout.ts`
- Create: `src/modules/tiling/lib/layout.test.ts`

**Interfaces:**
- Consumes: `PaneNode`, `PaneId`, `SplitDir`, `isLeaf`, `hasLeaf` and
  `normalizeSizes` from `panes.ts`.
- Produces:
  - `type Rect = { x: number; y: number; width: number; height: number }`
  - `type TileRect = Rect & { id: PaneId; hidden: boolean }`
  - `type Divider = { splitId: PaneId; index: number; dir: SplitDir; rect: Rect; span: number }`
  - `layoutTiles(tree, bounds: Rect, gap: number, zoomedLeafId?: PaneId | null): { tiles: TileRect[]; dividers: Divider[] }`
  - `adjustShares(tree, splitId, index, deltaShare, minShare): PaneNode`
  - `resetShares(tree, splitId): PaneNode`
  - `findResizeTarget(tree, leafId, axis: SplitDir, grow: boolean): { splitId: PaneId; index: number; sign: 1 | -1 } | null`
  - `MIN_TILE_WIDTH = 120`, `MIN_TILE_HEIGHT = 60`, `RESIZE_STEP = 0.05`

- [ ] **Step 1: Write the failing tests** (`layout.test.ts`).

```ts
import { describe, expect, it } from "vitest";
import type { PaneNode } from "@/modules/terminal/lib/panes";
import { adjustShares, findResizeTarget, layoutTiles, resetShares } from "./layout";

const leaf = (id: number): PaneNode => ({ kind: "leaf", id });
const B = { x: 0, y: 0, width: 1000, height: 600 };

describe("layoutTiles", () => {
  it("a single pane fills the bounds minus the outer gap", () => {
    const { tiles, dividers } = layoutTiles(leaf(1), B, 6);
    expect(tiles).toEqual([{ id: 1, x: 6, y: 6, width: 988, height: 588, hidden: false }]);
    expect(dividers).toEqual([]);
  });

  it("two panes side by side share the space with a gap between", () => {
    const tree: PaneNode = { kind: "split", id: 9, dir: "row", children: [leaf(1), leaf(2)] };
    const { tiles, dividers } = layoutTiles(tree, B, 6);
    const [a, b] = tiles;
    expect(a).toMatchObject({ id: 1, x: 6, y: 6, height: 588 });
    expect(b.x).toBe(a.x + a.width + 6);
    expect(b.x + b.width).toBe(994);
    expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1);
    expect(dividers).toEqual([
      { splitId: 9, index: 1, dir: "row", rect: { x: a.x + a.width, y: 6, width: 6, height: 588 }, span: 982 },
    ]);
  });

  it("respects sizes and neighbours share edges exactly", () => {
    const tree: PaneNode = {
      kind: "split", id: 9, dir: "col", children: [leaf(1), leaf(2), leaf(3)], sizes: [0.5, 0.3, 0.2],
    };
    const { tiles } = layoutTiles(tree, B, 6);
    expect(tiles[1].y).toBe(tiles[0].y + tiles[0].height + 6);
    expect(tiles[2].y).toBe(tiles[1].y + tiles[1].height + 6);
    expect(tiles[2].y + tiles[2].height).toBe(594);
    expect(tiles[0].height).toBe(Math.round(0.5 * 576));
  });

  it("a zoomed pane fills the area, the others are hidden, no dividers", () => {
    const tree: PaneNode = { kind: "split", id: 9, dir: "row", children: [leaf(1), leaf(2)] };
    const { tiles, dividers } = layoutTiles(tree, B, 6, 2);
    expect(tiles.find((t) => t.id === 2)).toEqual({ id: 2, x: 6, y: 6, width: 988, height: 588, hidden: false });
    expect(tiles.find((t) => t.id === 1)!.hidden).toBe(true);
    expect(dividers).toEqual([]);
  });

  it("a zoom on a leaf that is gone is ignored", () => {
    const { tiles } = layoutTiles(leaf(1), B, 6, 5);
    expect(tiles[0].hidden).toBe(false);
  });
});

describe("adjustShares", () => {
  const tree: PaneNode = { kind: "split", id: 9, dir: "row", children: [leaf(1), leaf(2)] };

  it("moves the boundary between two children", () => {
    const next = adjustShares(tree, 9, 1, 0.1, 0.1) as Extract<PaneNode, { kind: "split" }>;
    expect(next.sizes![0]).toBeCloseTo(0.6);
    expect(next.sizes![1]).toBeCloseTo(0.4);
  });

  it("adjustShares clamps at the minimum share", () => {
    const next = adjustShares(tree, 9, 1, 5, 0.2) as Extract<PaneNode, { kind: "split" }>;
    expect(next.sizes![0]).toBeCloseTo(0.8);
    expect(next.sizes![1]).toBeCloseTo(0.2);
    const back = adjustShares(next, 9, 1, -50, 0.2) as Extract<PaneNode, { kind: "split" }>;
    expect(back.sizes![0]).toBeCloseTo(0.2);
    expect(back.sizes![1]).toBeCloseTo(0.8);
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
    kind: "split", id: 9, dir: "row",
    children: [leaf(1), { kind: "split", id: 8, dir: "col", children: [leaf(2), leaf(3)] }],
  };

  it("growing the first child moves its right boundary", () => {
    expect(findResizeTarget(tree, 1, "row", true)).toEqual({ splitId: 9, index: 1, sign: 1 });
  });
  it("growing the last child moves its left boundary", () => {
    expect(findResizeTarget(tree, 2, "row", true)).toEqual({ splitId: 9, index: 1, sign: -1 });
  });
  it("uses the nearest split on the asked axis", () => {
    expect(findResizeTarget(tree, 3, "col", false)).toEqual({ splitId: 8, index: 1, sign: 1 });
  });
  it("is null with no split on that axis", () => {
    expect(findResizeTarget(tree, 1, "col", true)).toBeNull();
  });
});
```

- [ ] **Step 2: Watch them fail.** Run
  `pnpm vitest run src/modules/tiling/lib/layout.test.ts`. Expected: the
  module can't be resolved.

- [ ] **Step 3: Implement** `layout.ts`.

```ts
import {
  hasLeaf,
  isLeaf,
  normalizeSizes,
  type PaneId,
  type PaneNode,
  type SplitDir,
} from "@/modules/terminal/lib/panes";

export const MIN_TILE_WIDTH = 120;
export const MIN_TILE_HEIGHT = 60;
export const RESIZE_STEP = 0.05;

export type Rect = { x: number; y: number; width: number; height: number };
export type TileRect = Rect & { id: PaneId; hidden: boolean };
/** The gap between child `index - 1` and child `index` of a split. */
export type Divider = { splitId: PaneId; index: number; dir: SplitDir; rect: Rect; span: number };

export function layoutTiles(
  tree: PaneNode,
  bounds: Rect,
  gap: number,
  zoomedLeafId?: PaneId | null,
): { tiles: TileRect[]; dividers: Divider[] } {
  const inner: Rect = {
    x: bounds.x + gap,
    y: bounds.y + gap,
    width: Math.max(0, bounds.width - 2 * gap),
    height: Math.max(0, bounds.height - 2 * gap),
  };
  const tiles: TileRect[] = [];
  const dividers: Divider[] = [];
  place(tree, inner, gap, tiles, dividers);
  if (zoomedLeafId != null && hasLeaf(tree, zoomedLeafId)) {
    return {
      tiles: tiles.map((t) =>
        t.id === zoomedLeafId ? { ...inner, id: t.id, hidden: false } : { ...t, hidden: true },
      ),
      dividers: [],
    };
  }
  return { tiles, dividers };
}

function place(node: PaneNode, r: Rect, gap: number, tiles: TileRect[], dividers: Divider[]): void {
  if (isLeaf(node)) {
    tiles.push({ id: node.id, ...r, hidden: false });
    return;
  }
  const n = node.children.length;
  const shares = normalizeSizes(node.sizes, n);
  const row = node.dir === "row";
  const extent = row ? r.width : r.height;
  const span = Math.max(0, extent - gap * (n - 1));
  const origin = row ? r.x : r.y;
  let acc = 0;
  node.children.forEach((child, i) => {
    const start = origin + Math.round(acc * span) + i * gap;
    acc += shares[i];
    const end = origin + Math.round(acc * span) + i * gap;
    const childRect: Rect = row
      ? { x: start, y: r.y, width: end - start, height: r.height }
      : { x: r.x, y: start, width: r.width, height: end - start };
    if (i > 0) {
      const prevEnd = start - gap;
      dividers.push({
        splitId: node.id,
        index: i,
        dir: node.dir,
        rect: row
          ? { x: prevEnd, y: r.y, width: gap, height: r.height }
          : { x: r.x, y: prevEnd, width: r.width, height: gap },
        span,
      });
    }
    place(child, childRect, gap, tiles, dividers);
  });
}

function mapSplit(
  tree: PaneNode,
  splitId: PaneId,
  fn: (s: Extract<PaneNode, { kind: "split" }>) => PaneNode,
): PaneNode {
  if (isLeaf(tree)) return tree;
  if (tree.id === splitId) return fn(tree);
  let changed = false;
  const children = tree.children.map((c) => {
    const next = mapSplit(c, splitId, fn);
    if (next !== c) changed = true;
    return next;
  });
  return changed ? { ...tree, children } : tree;
}

/** Move the boundary before child `index` by `deltaShare`; positive grows child `index - 1`. */
export function adjustShares(
  tree: PaneNode,
  splitId: PaneId,
  index: number,
  deltaShare: number,
  minShare: number,
): PaneNode {
  return mapSplit(tree, splitId, (s) => {
    if (index < 1 || index >= s.children.length) return s;
    const shares = normalizeSizes(s.sizes, s.children.length);
    const pair = shares[index - 1] + shares[index];
    const min = Math.min(minShare, pair / 2);
    const left = Math.min(pair - min, Math.max(min, shares[index - 1] + deltaShare));
    const next = [...shares];
    next[index - 1] = left;
    next[index] = pair - left;
    return { ...s, sizes: next };
  });
}

/** Back to equal shares. */
export function resetShares(tree: PaneNode, splitId: PaneId): PaneNode {
  return mapSplit(tree, splitId, ({ sizes: _drop, ...rest }) => rest);
}

/** The boundary a keyboard resize of `leafId` on `axis` moves, and which way. */
export function findResizeTarget(
  tree: PaneNode,
  leafId: PaneId,
  axis: SplitDir,
  grow: boolean,
): { splitId: PaneId; index: number; sign: 1 | -1 } | null {
  const path: Array<{ split: Extract<PaneNode, { kind: "split" }>; child: number }> = [];
  const walk = (node: PaneNode): boolean => {
    if (isLeaf(node)) return node.id === leafId;
    for (let i = 0; i < node.children.length; i++) {
      path.push({ split: node, child: i });
      if (walk(node.children[i])) return true;
      path.pop();
    }
    return false;
  };
  if (!walk(tree)) return null;
  for (let k = path.length - 1; k >= 0; k--) {
    const { split, child } = path[k];
    if (split.dir !== axis) continue;
    const hasNext = child < split.children.length - 1;
    const index = hasNext ? child + 1 : child;
    // Growing the child before a boundary is a positive move; after it, negative.
    const before = hasNext ? 1 : -1;
    return { splitId: split.id, index, sign: (grow ? before : -before) as 1 | -1 };
  }
  return null;
}
```

- [ ] **Step 4: Run.** The `layout.test.ts` tests pass, then the full checks.
- [ ] **Step 5: Commit.**
  `git commit -m "feat(tiling): pixel layout, dividers and resizing"`

---

### Task 4: Saving sizes with Spaces

**Files:**
- Modify: `src/modules/spaces/lib/serialize.ts`
- Test: `src/modules/spaces/lib/serialize.test.ts` (add cases)

**Interfaces:**
- Consumes: `sanitizeSizes` (Task 1).
- Produces: `SerializedNode` split `{ kind: "split"; dir; children; sizes?: number[] }`.

- [ ] **Step 1: Write the failing tests.** Add them to `serialize.test.ts`,
  reusing its `term` and `counter` helpers:

```ts
describe("split sizes", () => {
  const split = (sizes?: number[]): PaneNode => ({
    kind: "split", id: 9, dir: "row",
    children: [{ kind: "leaf", id: 2, cwd: "/a" }, { kind: "leaf", id: 3, cwd: "/b" }],
    ...(sizes && { sizes }),
  });
  const hydrateTree = (s: SerializedTab[]) => {
    const [t] = hydrateTabs(s, "s1", counter());
    if (t.kind !== "terminal") throw new Error("expected a terminal tab");
    return t.paneTree;
  };

  it("round-trips sizes", () => {
    const tree = hydrateTree(serializeTabs([term({ paneTree: split([0.7, 0.3]) })]));
    expect(tree.kind).toBe("split");
    if (tree.kind !== "split") return;
    expect(tree.sizes![0]).toBeCloseTo(0.7);
    expect(tree.sizes![1]).toBeCloseTo(0.3);
  });

  it("loads stock-terax data with no sizes as equal splits", () => {
    const stock: SerializedTab[] = [{
      kind: "terminal",
      tree: { kind: "split", dir: "row", children: [{ kind: "leaf" }, { kind: "leaf" }] },
    }];
    expect(hydrateTree(stock)).not.toHaveProperty("sizes");
  });

  it("drops sizes of the wrong length or with bad values", () => {
    for (const bad of [[1], [0.5, null as unknown as number], [0.5, 0]]) {
      const data: SerializedTab[] = [{
        kind: "terminal",
        tree: { kind: "split", dir: "row", children: [{ kind: "leaf" }, { kind: "leaf" }], sizes: bad },
      }];
      expect(hydrateTree(data)).not.toHaveProperty("sizes");
    }
  });
});
```

- [ ] **Step 2: Watch them fail.** The round trip fails, because `sizes` is
  not written.

- [ ] **Step 3: Implement.**
  - Add `sizes?: number[]` to the `SerializedNode` split variant.
  - In `serializeNode`'s split branch, add `...(node.sizes && { sizes: node.sizes })`.
  - In `hydrateNode`, after the children are built and checked for length:

```ts
  const sizes = sanitizeSizes(node.sizes, children.length);
  return {
    kind: "split",
    id: allocId(),
    dir: node.dir,
    children,
    ...(sizes && { sizes }),
  };
```

  Add the "Modified" header.

- [ ] **Step 4: Run** the serialize tests, then the full checks.
- [ ] **Step 5: Commit.** `git commit -m "feat(tiling): save split sizes with Spaces"`

---

### Task 5: The prefix state machine

**Files:**
- Create: `src/modules/tiling/lib/prefix.ts`
- Create: `src/modules/tiling/lib/prefix.test.ts`

**Interfaces:**
- Consumes: `PaneDirection`, `SplitDir` from `panes.ts`.
- Produces:
  - `type PrefixKey = "ctrl+b" | "ctrl+a" | "ctrl+space"`
  - `type TilingAction = { type: "newTerminal" } | { type: "focus"; dir: PaneDirection } | { type: "swap"; dir: PaneDirection } | { type: "resize"; axis: SplitDir; grow: boolean } | { type: "zoom" } | { type: "close" } | { type: "help" } | { type: "sendPrefix" }`
  - `type PrefixState = { mode: "idle" } | { mode: "armed" } | { mode: "repeat"; key: string; until: number }`
  - `type KeyInput = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; isComposing?: boolean }`
  - `type PrefixStep = { state: PrefixState; action: TilingAction | null; consume: boolean }`
  - `REPEAT_MS = 600`, `IDLE: PrefixState`
  - `matchesPrefix(e: KeyInput, prefix: PrefixKey): boolean`
  - `actionForKey(e: KeyInput): TilingAction | null`
  - `stepPrefix(state: PrefixState, e: KeyInput, prefix: PrefixKey, now: number, inTerminalTab: boolean): PrefixStep`

- [ ] **Step 1: Write the failing tests** (`prefix.test.ts`).

```ts
import { describe, expect, it } from "vitest";
import { IDLE, REPEAT_MS, stepPrefix, type KeyInput, type PrefixState } from "./prefix";

const k = (key: string, mods: Partial<KeyInput> = {}): KeyInput => ({
  key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods,
});
const CB = k("b", { ctrlKey: true });
const step = (s: PrefixState, e: KeyInput, now = 0, inTerm = true) =>
  stepPrefix(s, e, "ctrl+b", now, inTerm);

describe("stepPrefix", () => {
  it("arms on Ctrl+B and consumes it", () => {
    expect(step(IDLE, CB)).toEqual({ state: { mode: "armed" }, action: null, consume: true });
  });

  it("lets ordinary keys through when idle", () => {
    expect(step(IDLE, k("h"))).toEqual({ state: IDLE, action: null, consume: false });
  });

  it("runs a mapped key and disarms", () => {
    const armed = step(IDLE, CB).state;
    expect(step(armed, k("Enter"))).toEqual({ state: IDLE, action: { type: "newTerminal" }, consume: true });
    expect(step(armed, k("h")).action).toEqual({ type: "focus", dir: "left" });
    expect(step(armed, k("ArrowDown")).action).toEqual({ type: "focus", dir: "down" });
    expect(step(armed, k("L", { shiftKey: true })).action).toEqual({ type: "swap", dir: "right" });
    expect(step(armed, k("ArrowUp", { shiftKey: true })).action).toEqual({ type: "swap", dir: "up" });
    expect(step(armed, k("z")).action).toEqual({ type: "zoom" });
    expect(step(armed, k("x")).action).toEqual({ type: "close" });
    expect(step(armed, k("?", { shiftKey: true })).action).toEqual({ type: "help" });
  });

  it("modifier-only keys keep the prefix armed", () => {
    const armed = step(IDLE, CB).state;
    const shift = step(armed, k("Shift", { shiftKey: true }));
    expect(shift).toEqual({ state: { mode: "armed" }, action: null, consume: false });
    expect(step(shift.state, k("H", { shiftKey: true })).action).toEqual({ type: "swap", dir: "left" });
  });

  it("Ctrl+B twice sends the prefix through", () => {
    const armed = step(IDLE, CB).state;
    expect(step(armed, CB)).toEqual({ state: IDLE, action: { type: "sendPrefix" }, consume: true });
  });

  it("Esc and unknown keys disarm and send nothing", () => {
    const armed = step(IDLE, CB).state;
    expect(step(armed, k("Escape"))).toEqual({ state: IDLE, action: null, consume: true });
    expect(step(armed, k("q"))).toEqual({ state: IDLE, action: null, consume: true });
    expect(step(armed, k("h", { metaKey: true }))).toEqual({ state: IDLE, action: null, consume: true });
  });

  it("a resize key repeats without the prefix inside the window", () => {
    const armed = step(IDLE, CB, 0).state;
    const first = step(armed, k(">", { shiftKey: true }), 100);
    expect(first.action).toEqual({ type: "resize", axis: "row", grow: true });
    expect(first.state).toEqual({ mode: "repeat", key: ">", until: 100 + REPEAT_MS });
    const again = step(first.state, k(">", { shiftKey: true }), 500);
    expect(again.action).toEqual({ type: "resize", axis: "row", grow: true });
    expect(again.state).toEqual({ mode: "repeat", key: ">", until: 500 + REPEAT_MS });
  });

  it("the repeat ends after the window or on another key", () => {
    const rep: PrefixState = { mode: "repeat", key: "-", until: 600 };
    expect(step(rep, k("-"), 700)).toEqual({ state: IDLE, action: null, consume: false });
    expect(step(rep, k("a"), 100)).toEqual({ state: IDLE, action: null, consume: false });
    expect(step(rep, CB, 100).state).toEqual({ mode: "armed" });
  });

  it("maps the four resize keys", () => {
    const armed = step(IDLE, CB).state;
    expect(step(armed, k("<", { shiftKey: true })).action).toEqual({ type: "resize", axis: "row", grow: false });
    expect(step(armed, k("-")).action).toEqual({ type: "resize", axis: "col", grow: false });
    expect(step(armed, k("+", { shiftKey: true })).action).toEqual({ type: "resize", axis: "col", grow: true });
    expect(step(armed, k("=")).action).toEqual({ type: "resize", axis: "col", grow: true });
  });

  it("ignores keys outside terminal tabs and while composing", () => {
    expect(step(IDLE, CB, 0, false)).toEqual({ state: IDLE, action: null, consume: false });
    expect(step(IDLE, { ...CB, isComposing: true })).toEqual({ state: IDLE, action: null, consume: false });
    const armed = step(IDLE, CB).state;
    expect(step(armed, k("h"), 0, false)).toEqual({ state: IDLE, action: null, consume: false });
  });

  it("supports Ctrl+A and Ctrl+Space as the prefix", () => {
    expect(stepPrefix(IDLE, k("a", { ctrlKey: true }), "ctrl+a", 0, true).state).toEqual({ mode: "armed" });
    expect(stepPrefix(IDLE, k(" ", { ctrlKey: true }), "ctrl+space", 0, true).state).toEqual({ mode: "armed" });
    expect(stepPrefix(IDLE, CB, "ctrl+a", 0, true).consume).toBe(false);
  });
});
```

- [ ] **Step 2: Watch them fail.** The module can't be resolved.

- [ ] **Step 3: Implement** `prefix.ts`.

```ts
import type { PaneDirection, SplitDir } from "@/modules/terminal/lib/panes";

export type PrefixKey = "ctrl+b" | "ctrl+a" | "ctrl+space";
export type TilingAction =
  | { type: "newTerminal" }
  | { type: "focus"; dir: PaneDirection }
  | { type: "swap"; dir: PaneDirection }
  | { type: "resize"; axis: SplitDir; grow: boolean }
  | { type: "zoom" }
  | { type: "close" }
  | { type: "help" }
  | { type: "sendPrefix" };
export type PrefixState =
  | { mode: "idle" }
  | { mode: "armed" }
  | { mode: "repeat"; key: string; until: number };
export type KeyInput = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing?: boolean;
};
export type PrefixStep = { state: PrefixState; action: TilingAction | null; consume: boolean };

export const REPEAT_MS = 600;
export const IDLE: PrefixState = { mode: "idle" };

const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock"]);
const PREFIX_CHAR: Record<PrefixKey, string> = { "ctrl+b": "b", "ctrl+a": "a", "ctrl+space": " " };

export function matchesPrefix(e: KeyInput, prefix: PrefixKey): boolean {
  return e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === PREFIX_CHAR[prefix];
}

const FOCUS: Record<string, PaneDirection> = {
  h: "left", j: "down", k: "up", l: "right",
  ArrowLeft: "left", ArrowDown: "down", ArrowUp: "up", ArrowRight: "right",
};
const SWAP: Record<string, PaneDirection> = { H: "left", J: "down", K: "up", L: "right" };
const RESIZE: Record<string, { axis: SplitDir; grow: boolean }> = {
  "<": { axis: "row", grow: false },
  ">": { axis: "row", grow: true },
  "-": { axis: "col", grow: false },
  "+": { axis: "col", grow: true },
  "=": { axis: "col", grow: true },
};

export function actionForKey(e: KeyInput): TilingAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === "Enter") return { type: "newTerminal" };
  if (e.key.startsWith("Arrow")) {
    const dir = FOCUS[e.key];
    return e.shiftKey ? { type: "swap", dir } : { type: "focus", dir };
  }
  if (FOCUS[e.key]) return { type: "focus", dir: FOCUS[e.key] };
  if (SWAP[e.key]) return { type: "swap", dir: SWAP[e.key] };
  if (RESIZE[e.key]) return { type: "resize", ...RESIZE[e.key] };
  if (e.key === "z") return { type: "zoom" };
  if (e.key === "x") return { type: "close" };
  if (e.key === "?") return { type: "help" };
  return null;
}

const PASS: PrefixStep = { state: IDLE, action: null, consume: false };

export function stepPrefix(
  state: PrefixState,
  e: KeyInput,
  prefix: PrefixKey,
  now: number,
  inTerminalTab: boolean,
): PrefixStep {
  if (!inTerminalTab || e.isComposing) return PASS;
  if (MODIFIERS.has(e.key)) return { state, action: null, consume: false };

  if (state.mode === "repeat") {
    if (now <= state.until && e.key === state.key) {
      const action = actionForKey(e);
      if (action?.type === "resize") {
        return { state: { mode: "repeat", key: e.key, until: now + REPEAT_MS }, action, consume: true };
      }
    }
    return stepPrefix(IDLE, e, prefix, now, inTerminalTab);
  }

  if (state.mode === "armed") {
    if (matchesPrefix(e, prefix)) return { state: IDLE, action: { type: "sendPrefix" }, consume: true };
    const action = e.key === "Escape" ? null : actionForKey(e);
    if (action?.type === "resize") {
      return { state: { mode: "repeat", key: e.key, until: now + REPEAT_MS }, action, consume: true };
    }
    return { state: IDLE, action, consume: true };
  }

  if (matchesPrefix(e, prefix)) return { state: { mode: "armed" }, action: null, consume: true };
  return PASS;
}
```

- [ ] **Step 4: Run** the prefix tests, then the full checks.
- [ ] **Step 5: Commit.** `git commit -m "feat(tiling): Ctrl+B prefix state machine"`

---

### Task 6: Tiling preferences

**Files:**
- Modify: `src/modules/settings/store.ts`
- Create: `src/modules/tiling/lib/settings.test.ts`

**Interfaces:**
- Produces:
  - `Preferences` fields: `tilingPrefix: PrefixKey`, `tilingGap: number`,
    `tilingTitleBars: boolean`, `tilingDimUnfocused: boolean`,
    `tilingAnimations: boolean`
  - `coerceTilingPrefix(v: unknown): PrefixKey`
  - `clampTilingGap(v: unknown): number`
  - setters `setTilingPrefix`, `setTilingGap`, `setTilingTitleBars`,
    `setTilingDimUnfocused`, `setTilingAnimations`

- [ ] **Step 1: Write the failing tests** (`settings.test.ts`). Follow the
  existing `src/modules/settings/editorFontSize.test.ts` for how the store
  module is imported (it mocks the Tauri store plugin when needed).

```ts
import { describe, expect, it } from "vitest";
import { clampTilingGap, coerceTilingPrefix, DEFAULT_PREFERENCES } from "@/modules/settings/store";

describe("tiling preferences", () => {
  it("defaults match the spec", () => {
    expect(DEFAULT_PREFERENCES).toMatchObject({
      tilingPrefix: "ctrl+b", tilingGap: 6, tilingTitleBars: true,
      tilingDimUnfocused: true, tilingAnimations: true,
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
```

- [ ] **Step 2: Watch them fail.** The imports aren't exported yet.

- [ ] **Step 3: Implement.** Add each preference to `store.ts`, following the
  `windowVibrancy` pattern in all five places:
  1. the field on `Preferences`;
  2. a `KEY_TILING_*` constant;
  3. the default in `DEFAULT_PREFERENCES`;
  4. the read in `loadPreferences`, going through the coerce or clamp helper;
  5. an async setter calling `writePref`, plus an entry in the key → field map
     near the bottom of the file, so changes reach other windows.

```ts
import type { PrefixKey } from "@/modules/tiling/lib/prefix";

const TILING_PREFIXES: readonly PrefixKey[] = ["ctrl+b", "ctrl+a", "ctrl+space"];
export function coerceTilingPrefix(v: unknown): PrefixKey {
  return TILING_PREFIXES.includes(v as PrefixKey) ? (v as PrefixKey) : "ctrl+b";
}
export function clampTilingGap(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 6;
  return Math.min(24, Math.max(0, Math.round(v)));
}
```

  Add the "Modified" header.

- [ ] **Step 4: Run** the settings tests, then the full checks.
- [ ] **Step 5: Commit.** `git commit -m "feat(tiling): tiling preferences"`

---

### Task 7: Tab operations

**Files:**
- Create: `src/modules/tiling/lib/tabOps.ts`
- Create: `src/modules/tiling/lib/tabOps.test.ts`
- Create: `src/modules/tiling/lib/layoutStore.ts` (zustand: the last layout of
  each tab)
- Modify: `src/modules/tabs/lib/useTabs.ts`. Add `zoomedLeafId?: PaneId` to
  `TerminalTab` and the new callbacks. Clear `zoomedLeafId` in `focusPane`,
  `focusNextPaneInTab`, `splitActivePane`, `closePaneByLeaf` and
  `closeActivePane`.

**Interfaces:**
- Consumes: Tasks 1, 2 and 3.
- Produces:
  - `planBspSplit(tab: TerminalTab, ids: { splitId: number; leafId: number }, tabSize: { width: number; height: number }, target: TileRect | undefined, gap: number): { tab: TerminalTab } | { refused: "max" | "room" | "blocks" }`
  - `planToggleZoom(tab: TerminalTab): TerminalTab`
  - `planFocusDirection(tab: TerminalTab, dir: PaneDirection, tiles: TileRect[]): TerminalTab`
  - `planResize(tab: TerminalTab, axis: SplitDir, grow: boolean, dividers: Divider[]): TerminalTab`
  - `planAdjustDivider(tab: TerminalTab, divider: Pick<Divider, "splitId" | "index" | "dir" | "span">, deltaPx: number): TerminalTab` and
    `planResetDivider(tab: TerminalTab, splitId: number): TerminalTab`
  - `useTilingLayoutStore`:
    `{ layouts: Record<number, TabLayout>; setLayout(tabId, l): void; clear(tabId): void }`,
    where `TabLayout = { tiles: TileRect[]; dividers: Divider[]; gap: number; width: number; height: number }`
  - new `useTabs` callbacks: `bspSplitActivePane(tabId) => "max" | "room" | "blocks" | null`,
    `toggleZoom(tabId)`, `focusPaneInDirection(tabId, dir)`,
    `resizeActivePane(tabId, axis, grow)`,
    `adjustDivider(tabId, divider, deltaPx)`,
    `resetDivider(tabId, splitId)`

- [ ] **Step 1: Write the failing tests** (`tabOps.test.ts`). Each `plan*`
  function is tested with a small `TerminalTab` fixture:

```ts
import { describe, expect, it } from "vitest";
import type { TerminalTab } from "@/modules/tabs/lib/useTabs";
import type { PaneNode } from "@/modules/terminal/lib/panes";
import { planAdjustDivider, planBspSplit, planFocusDirection, planResize, planToggleZoom } from "./tabOps";

const leaf = (id: number): PaneNode => ({ kind: "leaf", id });
const tab = (paneTree: PaneNode, activeLeafId: number, extra: Partial<TerminalTab> = {}): TerminalTab =>
  ({ id: 1, kind: "terminal", title: "t", paneTree, activeLeafId, cwd: "/w", ...extra }) as TerminalTab;
const tile = (id: number, x: number, y: number, width: number, height: number) =>
  ({ id, x, y, width, height, hidden: false });

describe("planBspSplit", () => {
  it("splits the active leaf side by side on a wide tab and focuses the new one", () => {
    const r = planBspSplit(tab(leaf(1), 1), { splitId: 10, leafId: 11 }, { width: 1200, height: 800 }, tile(1, 6, 6, 1188, 788), 6);
    expect("tab" in r && r.tab.paneTree).toEqual({
      kind: "split", id: 10, dir: "row", children: [leaf(1), { kind: "leaf", id: 11, cwd: "/w" }], sizes: [0.5, 0.5],
    });
    expect("tab" in r && r.tab.activeLeafId).toBe(11);
  });
  it("ends a zoom", () => {
    const r = planBspSplit(tab(leaf(1), 1, { zoomedLeafId: 1 }), { splitId: 10, leafId: 11 }, { width: 1200, height: 800 }, tile(1, 6, 6, 1188, 788), 6);
    expect("tab" in r && r.tab.zoomedLeafId).toBeUndefined();
  });
  it("refuses at the pane limit, when there is no room, and in Blocks tabs", () => {
    const four: PaneNode = { kind: "split", id: 9, dir: "row", children: [leaf(1), leaf(2), leaf(3), leaf(4)] };
    expect(planBspSplit(tab(four, 1), { splitId: 10, leafId: 11 }, { width: 1200, height: 800 }, tile(1, 0, 0, 300, 800), 6)).toEqual({ refused: "max" });
    expect(planBspSplit(tab(leaf(1), 1), { splitId: 10, leafId: 11 }, { width: 1200, height: 800 }, tile(1, 0, 0, 200, 800), 6)).toEqual({ refused: "room" });
    expect(planBspSplit(tab(leaf(1), 1, { blocks: true }), { splitId: 10, leafId: 11 }, { width: 1200, height: 800 }, tile(1, 0, 0, 1188, 788), 6)).toEqual({ refused: "blocks" });
  });
});

describe("planToggleZoom", () => {
  it("zooms the active leaf, then clears", () => {
    const t = tab({ kind: "split", id: 9, dir: "row", children: [leaf(1), leaf(2)] }, 2);
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
    const t = tab({ kind: "split", id: 9, dir: "row", children: [leaf(1), leaf(2)] }, 1, { zoomedLeafId: 1 });
    const next = planFocusDirection(t, "right", [tile(1, 0, 0, 500, 600), tile(2, 506, 0, 494, 600)]);
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
    const t = tab({ kind: "split", id: 9, dir: "row", children: [leaf(1), leaf(2)] }, 1);
    const next = planResize(t, "row", true, [{ splitId: 9, index: 1, dir: "row", rect: { x: 497, y: 6, width: 6, height: 588 }, span: 982 }]);
    const sizes = (next.paneTree as Extract<PaneNode, { kind: "split" }>).sizes!;
    expect(sizes[0]).toBeCloseTo(0.55);
  });
});
```

- [ ] **Step 2: Watch them fail.**

- [ ] **Step 3: Implement** `tabOps.ts`.

```ts
import { MAX_PANES_PER_TAB, type TerminalTab } from "@/modules/tabs/lib/useTabs";
import {
  directionalLeaf,
  findLeafCwd,
  leafIds,
  type PaneBounds,
  type PaneDirection,
  type SplitDir,
} from "@/modules/terminal/lib/panes";
import { leafDepth, spiralDirection, splitLeafBinary } from "./bsp";
import {
  adjustShares,
  type Divider,
  findResizeTarget,
  MIN_TILE_HEIGHT,
  MIN_TILE_WIDTH,
  RESIZE_STEP,
  resetShares,
  type TileRect,
} from "./layout";

export function planBspSplit(
  tab: TerminalTab,
  ids: { splitId: number; leafId: number },
  tabSize: { width: number; height: number },
  target: TileRect | undefined,
  gap: number,
): { tab: TerminalTab } | { refused: "max" | "room" | "blocks" } {
  if (tab.blocks) return { refused: "blocks" };
  if (leafIds(tab.paneTree).length >= MAX_PANES_PER_TAB) return { refused: "max" };
  const depth = leafDepth(tab.paneTree, tab.activeLeafId) ?? 0;
  const dir = spiralDirection(depth, tabSize.width, tabSize.height);
  if (target) {
    const needed = dir === "row" ? 2 * MIN_TILE_WIDTH + gap : 2 * MIN_TILE_HEIGHT + gap;
    const have = dir === "row" ? target.width : target.height;
    if (have < needed) return { refused: "room" };
  }
  const cwd = findLeafCwd(tab.paneTree, tab.activeLeafId) ?? tab.cwd;
  const paneTree = splitLeafBinary(tab.paneTree, tab.activeLeafId, ids.splitId, ids.leafId, dir, cwd);
  return { tab: { ...tab, paneTree, activeLeafId: ids.leafId, zoomedLeafId: undefined } };
}

export function planToggleZoom(tab: TerminalTab): TerminalTab {
  if (tab.zoomedLeafId !== undefined) return { ...tab, zoomedLeafId: undefined };
  if (leafIds(tab.paneTree).length < 2) return tab;
  return { ...tab, zoomedLeafId: tab.activeLeafId };
}

function toBounds(tiles: TileRect[]): PaneBounds[] {
  return tiles.map((t) => ({ id: t.id, left: t.x, top: t.y, right: t.x + t.width, bottom: t.y + t.height }));
}

export function planFocusDirection(tab: TerminalTab, dir: PaneDirection, tiles: TileRect[]): TerminalTab {
  const visible = tiles.map((t) => ({ ...t, hidden: false }));
  const target = directionalLeaf(tab.paneTree, tab.activeLeafId, dir, toBounds(visible));
  if (target === null || target === tab.activeLeafId) return tab;
  const cwd = findLeafCwd(tab.paneTree, target);
  return { ...tab, activeLeafId: target, zoomedLeafId: undefined, ...(cwd !== undefined && { cwd }) };
}

function minShareFor(dividers: Divider[], splitId: number, axis: SplitDir): number {
  const span = dividers.find((d) => d.splitId === splitId)?.span ?? 0;
  const min = axis === "row" ? MIN_TILE_WIDTH : MIN_TILE_HEIGHT;
  return span > 0 ? min / span : 0.1;
}

export function planResize(tab: TerminalTab, axis: SplitDir, grow: boolean, dividers: Divider[]): TerminalTab {
  const target = findResizeTarget(tab.paneTree, tab.activeLeafId, axis, grow);
  if (!target) return tab;
  const paneTree = adjustShares(
    tab.paneTree, target.splitId, target.index,
    target.sign * RESIZE_STEP, minShareFor(dividers, target.splitId, axis),
  );
  return paneTree === tab.paneTree ? tab : { ...tab, paneTree };
}

export function planAdjustDivider(
  tab: TerminalTab,
  divider: Pick<Divider, "splitId" | "index" | "dir" | "span">,
  deltaPx: number,
): TerminalTab {
  if (divider.span <= 0) return tab;
  const min = divider.dir === "row" ? MIN_TILE_WIDTH : MIN_TILE_HEIGHT;
  const paneTree = adjustShares(
    tab.paneTree, divider.splitId, divider.index, deltaPx / divider.span, min / divider.span,
  );
  return paneTree === tab.paneTree ? tab : { ...tab, paneTree };
}

export function planResetDivider(tab: TerminalTab, splitId: number): TerminalTab {
  const paneTree = resetShares(tab.paneTree, splitId);
  return paneTree === tab.paneTree ? tab : { ...tab, paneTree };
}
```

  Add a drag test to `tabOps.test.ts`:

```ts
describe("planAdjustDivider", () => {
  it("moves a row divider by pixels and clamps at the minimum width", () => {
    const t = tab({ kind: "split", id: 9, dir: "row", children: [leaf(1), leaf(2)] }, 1);
    const d = { splitId: 9, index: 1, dir: "row" as const, span: 1000 };
    const moved = planAdjustDivider(t, d, 100).paneTree as Extract<PaneNode, { kind: "split" }>;
    expect(moved.sizes![0]).toBeCloseTo(0.6);
    const clamped = planAdjustDivider(t, d, 5000).paneTree as Extract<PaneNode, { kind: "split" }>;
    expect(clamped.sizes![1]).toBeCloseTo(120 / 1000);
  });
});
```

  `layoutStore.ts`:

```ts
import { create } from "zustand";
import type { Divider, TileRect } from "./layout";

export type TabLayout = { tiles: TileRect[]; dividers: Divider[]; gap: number; width: number; height: number };

export const useTilingLayoutStore = create<{
  layouts: Record<number, TabLayout>;
  setLayout: (tabId: number, layout: TabLayout) => void;
  clear: (tabId: number) => void;
}>((set) => ({
  layouts: {},
  setLayout: (tabId, layout) => set((s) => ({ layouts: { ...s.layouts, [tabId]: layout } })),
  clear: (tabId) =>
    set((s) => {
      const { [tabId]: _drop, ...rest } = s.layouts;
      return { layouts: rest };
    }),
}));
```

  The `useTabs` callbacks all have the same shape:
  `setTabs((curr) => curr.map((t) => t.id === tabId && t.kind === "terminal" ? plan(t) : t))`.
  The layout is read with `useTilingLayoutStore.getState().layouts[tabId]`.
  For `bspSplitActivePane`, allocate the IDs from `nextIdRef`, call
  `planBspSplit` with the active leaf's tile, and return the refusal reason or
  `null`.

- [ ] **Step 4: Run** the `tabOps` tests, then the full checks.
- [ ] **Step 5: Commit.** `git commit -m "feat(tiling): tab operations for BSP, zoom, focus and resize"`

---

### Task 8: `TiledLayout` and `TileWindow` (renderer, look, animations)

**Files:**
- Create: `src/modules/tiling/TiledLayout.tsx`
- Create: `src/modules/tiling/TileWindow.tsx`
- Create: `src/modules/tiling/lib/tilePlan.ts`
- Create: `src/modules/tiling/lib/tilePlan.test.ts`
- Create: `src/modules/tiling/index.ts`
- Modify: `src/modules/terminal/PaneTreeView.tsx`. Render
  `<TiledLayout .../>` instead of the nested panels, and keep `DropOverlay`
  and the `data-pane-leaf` attribute that `livePaneBounds` reads.
- Modify: `src/modules/terminal/TerminalStack.tsx`. Pass through `tabId`,
  `zoomedLeafId` and the new callbacks.
- Modify: `src/app/App.tsx`. Hand `TerminalStack` the `useTabs` callbacks:
  `adjustDivider`, `resetDivider`, `toggleZoom`, and `closePaneByLeaf` for the
  close dot.

**Interfaces:**
- Consumes: `layoutTiles`, `useTilingLayoutStore`, the preferences, and
  `beginTerminalResizeInteraction` / `endTerminalResizeInteraction`.
- Produces:
  - `planTiles(prev: TileRect[] | null, next: TileRect[], activeLeafId: number, gone: number[]): TilePlanItem[]`,
    where
    `TilePlanItem = { key: string; id: number; rect: Rect; from: Rect | null; hidden: boolean; focused: boolean; ghost: boolean }`
  - `<TiledLayout tabId node activeLeafId zoomedLeafId tabVisible blocks onFocusLeaf getBundle onAdjustDivider onResetDivider onCloseLeaf onToggleZoom />`

- [ ] **Step 1: Write the failing tests** (`tilePlan.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { planTiles } from "./tilePlan";

const t = (id: number, x: number, w: number) => ({ id, x, y: 0, width: w, height: 100, hidden: false });

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
    const plan = planTiles([t(1, 0, 97), t(2, 103, 97)], [t(1, 0, 200)], 1, [2]);
    const ghost = plan.find((p) => p.ghost)!;
    expect(ghost).toMatchObject({ key: "ghost-2", id: 2, from: { x: 103, y: 0, width: 97, height: 100 } });
    expect(ghost.rect.width).toBe(0);
  });
});
```

- [ ] **Step 2: Watch them fail.**

- [ ] **Step 3: Implement** `tilePlan.ts`.

```ts
import type { Rect, TileRect } from "./layout";

export type TilePlanItem = {
  key: string; id: number; rect: Rect; from: Rect | null;
  hidden: boolean; focused: boolean; ghost: boolean;
};

const rectOf = ({ x, y, width, height }: Rect): Rect => ({ x, y, width, height });

export function planTiles(
  prev: TileRect[] | null,
  next: TileRect[],
  activeLeafId: number,
  gone: number[],
): TilePlanItem[] {
  const before = new Map((prev ?? []).map((p) => [p.id, p]));
  const items: TilePlanItem[] = next.map((tile) => ({
    key: `leaf-${tile.id}`,
    id: tile.id,
    rect: rectOf(tile),
    from: prev && !before.has(tile.id) ? { ...rectOf(tile), width: 0 } : null,
    hidden: tile.hidden,
    focused: tile.id === activeLeafId,
    ghost: false,
  }));
  for (const id of gone) {
    const last = before.get(id);
    if (!last) continue;
    items.push({
      key: `ghost-${id}`, id, from: rectOf(last), rect: { ...rectOf(last), width: 0 },
      hidden: false, focused: false, ghost: true,
    });
  }
  return items;
}
```

  `TiledLayout.tsx` responsibilities:
  - Track the container size with a `ResizeObserver`.
  - Compute `layoutTiles(node, {x:0, y:0, width, height}, gap, zoomedLeafId)`
    with `useMemo`, and publish it with `useTilingLayoutStore.setLayout(tabId, ...)`
    in an effect; clear it on unmount.
  - Keep the previous tiles in a ref, work out `gone` (IDs that were in the
    previous tiles but not the next), and call `planTiles`.
  - Turn animation on only when the tree, zoom or focus changed, the container
    size did not change, the Animations setting is on, and
    `matchMedia("(prefers-reduced-motion: reduce)")` doesn't match. When it's
    on, call `beginTerminalResizeInteraction(token)` and end it after the
    `--dur-base` value (read from `getComputedStyle(document.documentElement)`,
    falling back to 220 ms) plus 40 ms. That gives one terminal fit when the
    animation ends.
  - For entering tiles, render the first frame at `from` and set `rect` on the
    next animation frame. Do the same for ghosts, and remove each ghost after
    the duration.
  - Render each divider as an absolutely positioned `div` covering `divider.rect`,
    widened to at least 8 px across its axis with negative margins, with
    `cursor: col-resize` or `row-resize`. On pointerdown: capture the pointer,
    call `beginTerminalResizeInteraction`, and record the last pointer
    coordinate. On pointermove: call `onAdjustDivider(divider, deltaPx)` with
    the movement since the last event. On pointerup or cancel: end the interaction. On
    double-click: `onResetDivider(splitId)`.

  `TileWindow.tsx` renders one tile:
  - An absolutely positioned frame at `rect`, with
    `transition: left, top, width, height, opacity var(--dur-base) var(--ease-premium)`
    when animating.
  - `rounded-[var(--radius-lg)] border overflow-hidden`; the border is
    `border-[var(--accent)]` when focused and `border-border` otherwise.
  - An optional title bar, 24 px tall:
    - two dots (close: `onCloseLeaf(id)`, zoom: `onToggleZoom(id)`);
    - the title: the leaf's cwd basename, or "terminal";
    - the agent badge, from `useAgentActivityStore` via
      `ptyIdForLeaf(id)`: ◐ for working, ● for attention, ✓ for finished.
  - The body is the existing leaf element (`data-pane-leaf`, `TerminalPane`,
    `DropOverlay`).
  - `opacity: 0.85` on the body when the tile isn't focused and Dim is on.
  - `hidden` maps to `opacity: 0; pointer-events: none`.
  - Ghost tiles draw the frame only, with no terminal.

- [ ] **Step 4: Run** the `tilePlan` tests and the full checks. Check the
  result by hand in the browser preview (`pnpm dev` shows the interface; PTYs
  need the Tauri app, so the real check is at Task 10).
- [ ] **Step 5: Commit.** `git commit -m "feat(tiling): tiled renderer, window look and animations"`

---

### Task 9: The Ctrl+B layer, shortcuts, status indicator, cheat-sheet and settings

**Files:**
- Create: `src/modules/tiling/lib/useTilingPrefix.ts`
- Create: `src/modules/tiling/TilingHelp.tsx` (the cheat-sheet)
- Create: `src/settings/sections/TilingSection.tsx`
- Modify: `src/modules/shortcuts/shortcuts.ts`. Add the IDs `tiling.newTerminal`,
  `tiling.focusLeft`/`Down`/`Up`/`Right`, `tiling.swapLeft`/`Down`/`Up`/`Right`,
  `tiling.grow`/`shrink`/`taller`/`shorter`, `tiling.zoom` and `tiling.close`,
  each with `group: "Tiling"` and `defaultBindings: []`.
- Modify: `src/app/App.tsx`. Call `useTilingPrefix` with a handler table that
  calls the `useTabs` callbacks and `toast` for refusals; add the `tiling.*`
  entries to `shortcutHandlers`.
- Modify: `src/modules/statusbar/StatusBar.tsx`. Show `<prefix> …` while armed,
  read from a small zustand flag that `useTilingPrefix` sets.
- Modify: `src/settings/SettingsApp.tsx`. Add the Tiling section.

**Interfaces:**
- Consumes: `stepPrefix` (Task 5), the preferences (Task 6), and the
  `useTabs` callbacks (Task 7).
- Produces: `useTilingPrefix(opts: { activeTab: Tab | undefined; onAction: (a: TilingAction) => void; disabled: boolean }): void`,
  and `useTilingPrefixArmed(): boolean` for the status bar.

- [ ] **Step 1: Write the failing test.** Shortcut registry invariants go in
  `src/modules/shortcuts/shortcuts.test.ts`:

```ts
it("registers the tiling actions with no default chord", () => {
  const tiling = SHORTCUTS.filter((s) => s.id.startsWith("tiling."));
  expect(tiling.map((s) => s.id).sort()).toEqual([
    "tiling.close", "tiling.focusDown", "tiling.focusLeft", "tiling.focusRight", "tiling.focusUp",
    "tiling.grow", "tiling.newTerminal", "tiling.shorter", "tiling.shrink",
    "tiling.swapDown", "tiling.swapLeft", "tiling.swapRight", "tiling.swapUp",
    "tiling.taller", "tiling.zoom",
  ]);
  for (const s of tiling) {
    expect(s.group).toBe("Tiling");
    expect(s.defaultBindings).toEqual([]);
  }
});
```

  (Use the registry's real exported name; read it from the top of
  `shortcuts.ts`. If any existing test asserts every shortcut has a default
  binding, narrow it to skip `tiling.*` and say so in the commit message.)

- [ ] **Step 2: Watch it fail.**

- [ ] **Step 3: Implement.**

`useTilingPrefix.ts`:

```ts
import { useEffect, useRef } from "react";
import { create } from "zustand";
import type { Tab } from "@/modules/tabs/lib/useTabs";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { IDLE, type PrefixState, stepPrefix, type TilingAction } from "./prefix";

export const useTilingPrefixArmedStore = create<{ armed: boolean; set: (v: boolean) => void }>((set) => ({
  armed: false,
  set: (armed) => set({ armed }),
}));
export const useTilingPrefixArmed = () => useTilingPrefixArmedStore((s) => s.armed);

export function useTilingPrefix(opts: {
  activeTab: Tab | undefined;
  onAction: (a: TilingAction) => void;
  disabled: boolean;
}): void {
  const prefix = usePreferencesStore((s) => s.tilingPrefix);
  const state = useRef<PrefixState>(IDLE);
  const latest = useRef(opts);
  latest.current = opts;

  useEffect(() => {
    const setArmed = useTilingPrefixArmedStore.getState().set;
    const onKey = (e: KeyboardEvent) => {
      const { activeTab, onAction, disabled } = latest.current;
      const inTerminal = !disabled && activeTab?.kind === "terminal";
      const result = stepPrefix(state.current, e, prefix, performance.now(), inTerminal);
      state.current = result.state;
      setArmed(result.state.mode === "armed");
      if (result.consume) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      if (result.action) onAction(result.action);
    };
    const reset = () => {
      state.current = IDLE;
      setArmed(false);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("blur", reset);
    };
  }, [prefix]);

  // A tab change disarms.
  const tabId = opts.activeTab?.id;
  useEffect(() => {
    state.current = IDLE;
    useTilingPrefixArmedStore.getState().set(false);
  }, [tabId]);
}
```

  It must be registered **before** `useGlobalShortcuts` in `App.tsx`, so its
  capture listener runs first and `stopImmediatePropagation` keeps a consumed
  key from also triggering a global shortcut.

  The action table in `App.tsx`:

```ts
const onTilingAction = useCallback((a: TilingAction) => {
  const t = tabsRef.current.find((x) => x.id === activeId);
  if (!t || t.kind !== "terminal") return;
  switch (a.type) {
    case "newTerminal": {
      const refused = bspSplitActivePane(t.id);
      if (refused === "max") toast("A tab holds at most 4 terminals.");
      else if (refused === "room") toast("Not enough room for another terminal.");
      return;
    }
    case "focus": return focusPaneInDirection(t.id, a.dir);
    case "swap": return swapActivePaneInDirection(t.id, a.dir, livePaneBounds(t.id));
    case "resize": return resizeActivePane(t.id, a.axis, a.grow);
    case "zoom": return toggleZoom(t.id);
    case "close": return handleCloseTabOrPane();
    case "help": return setTilingHelpOpen(true);
    case "sendPrefix": {
      const ch = tilingPrefix === "ctrl+a" ? "\x01" : tilingPrefix === "ctrl+space" ? "\x00" : "\x02";
      writeToSession(t.activeLeafId, ch);
      return;
    }
  }
}, [/* the callbacks used */]);
```

  Use the `toast` import that terax already uses elsewhere (find it with
  `grep -rn "from \"sonner\"" src`).

  `TilingSection.tsx` follows `GeneralSection.tsx`'s row components:
  - a select for the prefix (Ctrl+B / Ctrl+A / Ctrl+Space);
  - a slider or number field for the gap (0–24);
  - three switches: title bars, dim unfocused, animations.

  Each control calls the matching setter from Task 6.

  `TilingHelp.tsx` is a small dialog listing the table from the spec's
  section 3.5, opened by `?` and closed by Esc. Use terax's existing dialog
  component; find it with `grep -rn "components/ui/dialog" src | head -1`.

- [ ] **Step 4: Run** the shortcut tests and the full checks.
- [ ] **Step 5: Commit.** `git commit -m "feat(tiling): Ctrl+B layer, shortcuts, status indicator, help and settings"`

---

### Task 10: License notes, fork build workflow and final checks

**Files:**
- Create: `NOTICE`
- Create: `.github/workflows/fork-build.yml`
- Modify: the "Modified" headers on every edited upstream file (check with
  `git diff --name-only main...`).

- [ ] **Step 1: Write `NOTICE`.**

```
Terax Tiling
A modified fork of Terax (https://github.com/crynta/terax-ai), Apache-2.0.
Modifications (2026): tuios-style tiling for terminal tabs: BSP placement,
window look, animations and a Ctrl+B keyboard layer. Original copyright
notices are kept in LICENSE and in the source files.
```

- [ ] **Step 2: Write `fork-build.yml`.**

```yaml
name: fork-build
on:
  workflow_dispatch:
  push:
    branches: [tuios-tiling]
jobs:
  macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - uses: dtolnay/rust-toolchain@stable
      - uses: swatinem/rust-cache@v2
        with:
          workspaces: src-tauri
      - run: pnpm install --frozen-lockfile
      - name: Build unsigned app (fork identity, no updater)
        run: >
          pnpm tauri build --bundles app --no-sign --config
          '{"identifier":"app.crynta.terax.tiling","productName":"Terax Tiling",
          "bundle":{"createUpdaterArtifacts":false},
          "plugins":{"updater":{"active":false,"endpoints":[]}}}'
      - name: Zip the app
        run: |
          cd src-tauri/target/release/bundle/macos
          ditto -c -k --keepParent "Terax Tiling.app" terax-tiling-macos.zip
      - uses: actions/upload-artifact@v7
        with:
          name: terax-tiling-macos
          path: src-tauri/target/release/bundle/macos/terax-tiling-macos.zip
```

  Before relying on this, check that the action versions match those used in
  `ci.yml`, and that `--no-sign` exists in the installed `@tauri-apps/cli`
  (`pnpm tauri build --help`). If it doesn't, drop the flag; with no signing
  identity configured, the build is unsigned anyway. Also check whether the
  updater plugin rejects `"active": false`. If it does, override `endpoints`
  only and leave the plugin registered.

- [ ] **Step 3: Final checks.** `pnpm test`, `pnpm check-types`, `pnpm lint`
  (0 errors), `pnpm format:check` (format the new files with `pnpm format` if
  needed), and `pnpm build && pnpm size`. All must pass. If `size` goes over
  the budget, report by how much rather than raising the budget silently.

- [ ] **Step 4: Commit.** `git commit -m "chore: NOTICE, fork build workflow"`

- [ ] **Step 5: GitHub (needs the user's go-ahead).** Ask before creating the
  fork. Once approved:
  - `gh repo fork crynta/terax-ai --clone=false`;
  - add the fork as the `fork` remote;
  - `git push fork tuios-tiling`;
  - watch the run with `gh run watch`;
  - `gh run download -n terax-tiling-macos` into `~/Applications`;
  - unzip it and clear the quarantine flag (`xattr -dr com.apple.quarantine`);
  - launch it, then check the animations, that each change causes one PTY
    resize (terax's terminal diagnostics), and idle and animating CPU against
    stock terax.
