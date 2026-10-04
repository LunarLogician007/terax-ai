import { create } from "zustand";
import type { Divider } from "./layout";

type DividerRef = Pick<Divider, "splitId" | "index" | "dir" | "span">;

/** What a tiled window can ask of the tab it lives in. */
export type TilingActions = {
  adjustDivider: (tabId: number, divider: DividerRef, deltaPx: number) => void;
  resetDivider: (tabId: number, splitId: number) => void;
  toggleZoom: (tabId: number, leafId: number) => void;
  closeLeaf: (leafId: number) => void;
};

const noop: TilingActions = {
  adjustDivider: () => {},
  resetDivider: () => {},
  toggleZoom: () => {},
  closeLeaf: () => {},
};

/**
 * Registered by App, which owns the tab state, and read by TiledLayout. A
 * store rather than props, so the callbacks don't have to be threaded through
 * every component between the two.
 */
export const useTilingActionsStore = create<{
  actions: TilingActions;
  register: (actions: TilingActions) => void;
}>((set) => ({
  actions: noop,
  register: (actions) => set({ actions }),
}));
