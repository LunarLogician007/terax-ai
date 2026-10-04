import {
  MAX_PANES_PER_TAB,
  type TerminalTab,
} from "@/modules/tabs/lib/useTabs";
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

export type SplitRefusal = "max" | "room" | "blocks";

/**
 * A new terminal by tuios's BSP rule: the active pane is cut in half along
 * the spiral's axis, and the new pane gets focus. `target` is the active
 * pane's current tile, used to refuse a split that would leave either half
 * below the minimum size.
 */
export function planBspSplit(
  tab: TerminalTab,
  ids: { splitId: number; leafId: number },
  tabSize: { width: number; height: number },
  target: TileRect | undefined,
  gap: number,
): { tab: TerminalTab } | { refused: SplitRefusal } {
  if (tab.blocks) return { refused: "blocks" };
  if (leafIds(tab.paneTree).length >= MAX_PANES_PER_TAB) {
    return { refused: "max" };
  }
  const depth = leafDepth(tab.paneTree, tab.activeLeafId) ?? 0;
  const dir = spiralDirection(depth, tabSize.width, tabSize.height);
  if (target) {
    const needed =
      dir === "row" ? 2 * MIN_TILE_WIDTH + gap : 2 * MIN_TILE_HEIGHT + gap;
    const have = dir === "row" ? target.width : target.height;
    if (have < needed) return { refused: "room" };
  }
  const cwd = findLeafCwd(tab.paneTree, tab.activeLeafId) ?? tab.cwd;
  const paneTree = splitLeafBinary(
    tab.paneTree,
    tab.activeLeafId,
    ids.splitId,
    ids.leafId,
    dir,
    cwd,
  );
  return {
    tab: {
      ...tab,
      paneTree,
      activeLeafId: ids.leafId,
      zoomedLeafId: undefined,
    },
  };
}

/** Zoom the active pane, or end the zoom. One pane has nothing to zoom. */
export function planToggleZoom(tab: TerminalTab): TerminalTab {
  if (tab.zoomedLeafId !== undefined)
    return { ...tab, zoomedLeafId: undefined };
  if (leafIds(tab.paneTree).length < 2) return tab;
  return { ...tab, zoomedLeafId: tab.activeLeafId };
}

function toBounds(tiles: TileRect[]): PaneBounds[] {
  return tiles.map((t) => ({
    id: t.id,
    left: t.x,
    top: t.y,
    right: t.x + t.width,
    bottom: t.y + t.height,
  }));
}

/** Focus the pane next to the active one, judged by where the tiles are. */
export function planFocusDirection(
  tab: TerminalTab,
  dir: PaneDirection,
  tiles: TileRect[],
): TerminalTab {
  const target = directionalLeaf(
    tab.paneTree,
    tab.activeLeafId,
    dir,
    toBounds(tiles),
  );
  if (target === null || target === tab.activeLeafId) return tab;
  const cwd = findLeafCwd(tab.paneTree, target);
  return {
    ...tab,
    activeLeafId: target,
    zoomedLeafId: undefined,
    ...(cwd !== undefined && { cwd }),
  };
}

function minShare(span: number | undefined, axis: SplitDir): number {
  const min = axis === "row" ? MIN_TILE_WIDTH : MIN_TILE_HEIGHT;
  return span && span > 0 ? min / span : 0.1;
}

/** One keyboard resize step for the active pane along `axis`. */
export function planResize(
  tab: TerminalTab,
  axis: SplitDir,
  grow: boolean,
  dividers: Divider[],
): TerminalTab {
  const target = findResizeTarget(tab.paneTree, tab.activeLeafId, axis, grow);
  if (!target) return tab;
  const span = dividers.find((d) => d.splitId === target.splitId)?.span;
  const paneTree = adjustShares(
    tab.paneTree,
    target.splitId,
    target.index,
    target.sign * RESIZE_STEP,
    minShare(span, axis),
  );
  return paneTree === tab.paneTree ? tab : { ...tab, paneTree };
}

/** A divider dragged by `deltaPx` pixels. */
export function planAdjustDivider(
  tab: TerminalTab,
  divider: Pick<Divider, "splitId" | "index" | "dir" | "span">,
  deltaPx: number,
): TerminalTab {
  if (divider.span <= 0) return tab;
  const paneTree = adjustShares(
    tab.paneTree,
    divider.splitId,
    divider.index,
    deltaPx / divider.span,
    minShare(divider.span, divider.dir),
  );
  return paneTree === tab.paneTree ? tab : { ...tab, paneTree };
}

/** A divider double-clicked: back to equal shares. */
export function planResetDivider(
  tab: TerminalTab,
  splitId: number,
): TerminalTab {
  const paneTree = resetShares(tab.paneTree, splitId);
  return paneTree === tab.paneTree ? tab : { ...tab, paneTree };
}
