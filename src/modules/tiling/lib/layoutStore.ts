import { create } from "zustand";
import type { Divider, TileRect } from "./layout";

/** The layout a terminal tab was last drawn with. */
export type TabLayout = {
  tiles: TileRect[];
  dividers: Divider[];
  gap: number;
  width: number;
  height: number;
};

/**
 * Written by TiledLayout each time a tab is laid out, and read by keyboard
 * actions, which need to know where the panes are on screen.
 */
export const useTilingLayoutStore = create<{
  layouts: Record<number, TabLayout>;
  setLayout: (tabId: number, layout: TabLayout) => void;
  clear: (tabId: number) => void;
}>((set) => ({
  layouts: {},
  setLayout: (tabId, layout) =>
    set((s) => ({ layouts: { ...s.layouts, [tabId]: layout } })),
  clear: (tabId) =>
    set((s) => {
      const { [tabId]: _drop, ...rest } = s.layouts;
      return { layouts: rest };
    }),
}));
