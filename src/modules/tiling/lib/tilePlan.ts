import type { Rect, TileRect } from "./layout";

/** One element TiledLayout draws: a pane's window, or the ghost of a closed one. */
export type TilePlanItem = {
  key: string;
  id: number;
  rect: Rect;
  /** Where the window starts before animating to `rect`; null = no entry animation. */
  from: Rect | null;
  hidden: boolean;
  focused: boolean;
  ghost: boolean;
};

const rectOf = ({ x, y, width, height }: Rect): Rect => ({
  x,
  y,
  width,
  height,
});

/**
 * What to draw for a layout change from `prev` to `next`. Panes are keyed by
 * leaf id, so a reshape moves a window rather than recreating its terminal.
 * A pane that is new grows out of its leading edge; a pane in `gone` leaves
 * a frame-only ghost that shrinks away. The first layout (`prev` null)
 * animates nothing.
 */
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
      key: `ghost-${id}`,
      id,
      from: rectOf(last),
      rect: { ...rectOf(last), width: 0 },
      hidden: false,
      focused: false,
      ghost: true,
    });
  }
  return items;
}

/**
 * Whether a layout change animates. Never while a divider is being dragged,
 * so the panes follow the pointer, nor for a resize of the window itself.
 */
export function shouldAnimate(s: {
  ready: boolean;
  animationsOn: boolean;
  reducedMotion: boolean;
  sizeChanged: boolean;
  dragging: boolean;
}): boolean {
  return (
    s.ready &&
    s.animationsOn &&
    !s.reducedMotion &&
    !s.sizeChanged &&
    !s.dragging
  );
}
