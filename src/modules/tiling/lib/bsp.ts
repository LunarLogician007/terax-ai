import {
  isLeaf,
  type PaneId,
  type PaneNode,
  type SplitDir,
} from "@/modules/terminal/lib/panes";

/** How many splits sit above leaf `id`, or null when it isn't in the tree. */
export function leafDepth(
  tree: PaneNode,
  id: PaneId,
  depth = 0,
): number | null {
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
export function spiralDirection(
  depth: number,
  width: number,
  height: number,
): SplitDir {
  const even: SplitDir = width >= height ? "row" : "col";
  if (depth % 2 === 0) return even;
  return even === "row" ? "col" : "row";
}

/**
 * Replace leaf `targetId` with a 50/50 split of it and a new leaf. Unlike
 * `splitLeaf`, this always cuts the target in two, even when its parent
 * already runs the same way, which is what makes the layout a BSP.
 */
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
    return {
      kind: "split",
      id: newSplitId,
      dir,
      children: [tree, fresh],
      sizes: [0.5, 0.5],
    };
  }
  let changed = false;
  const children = tree.children.map((child) => {
    const next = splitLeafBinary(
      child,
      targetId,
      newSplitId,
      newLeafId,
      dir,
      newCwd,
    );
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...tree, children } : tree;
}
