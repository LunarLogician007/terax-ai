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
/** One keyboard resize step, as a share of the split. */
export const RESIZE_STEP = 0.05;

export type Rect = { x: number; y: number; width: number; height: number };
export type TileRect = Rect & { id: PaneId; hidden: boolean };
/**
 * The gap between child `index - 1` and child `index` of a split. `span` is
 * the pixels the split's children share, which turns a drag into a share.
 */
export type Divider = {
  splitId: PaneId;
  index: number;
  dir: SplitDir;
  rect: Rect;
  span: number;
};

/**
 * Each leaf's rectangle in pixels, with `gap` between siblings and around the
 * outside. Edges are rounded from the running total of shares, so neighbours
 * meet exactly and the last pane ends on the far edge. A zoomed leaf gets the
 * whole area; the others keep their rectangles but are marked hidden, so they
 * can fade out in place.
 */
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
        t.id === zoomedLeafId
          ? { ...inner, id: t.id, hidden: false }
          : { ...t, hidden: true },
      ),
      dividers: [],
    };
  }
  return { tiles, dividers };
}

function place(
  node: PaneNode,
  r: Rect,
  gap: number,
  tiles: TileRect[],
  dividers: Divider[],
): void {
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

/**
 * Move the boundary before child `index` by `deltaShare`; positive grows child
 * `index - 1`. Only the two children either side change, and neither goes
 * below `minShare` (or half their pair, when the pair is smaller than that).
 */
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
    const left = Math.min(
      pair - min,
      Math.max(min, shares[index - 1] + deltaShare),
    );
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

/**
 * The boundary a keyboard resize of `leafId` along `axis` moves, and which
 * way. It is the nearest split on that axis above the leaf. The boundary
 * after the leaf's branch is used when there is one, else the one before.
 */
export function findResizeTarget(
  tree: PaneNode,
  leafId: PaneId,
  axis: SplitDir,
  grow: boolean,
): { splitId: PaneId; index: number; sign: 1 | -1 } | null {
  const path: Array<{
    split: Extract<PaneNode, { kind: "split" }>;
    child: number;
  }> = [];
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
    // The leaf's branch sits before the boundary when it has a next sibling,
    // so growing it is a positive move; after the boundary it is negative.
    const before: 1 | -1 = hasNext ? 1 : -1;
    const after: 1 | -1 = hasNext ? -1 : 1;
    return { splitId: split.id, index, sign: grow ? before : after };
  }
  return null;
}
