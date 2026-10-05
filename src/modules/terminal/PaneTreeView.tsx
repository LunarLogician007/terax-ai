// Modified for TOSS Terminal (tuios-style tiling), 2026.
import type { SearchAddon } from "@xterm/addon-search";
import { TiledLayout } from "@/modules/tiling";
import { useTerminalDropStore } from "./lib/dropStore";
import type { PaneNode } from "./lib/panes";
import { TerminalPane, type TerminalPaneHandle } from "./TerminalPane";

type LeafBundle = {
  setRef: (h: TerminalPaneHandle | null) => void;
  onSearchReady: (leafId: number, addon: SearchAddon) => void;
  onCwd: (leafId: number, cwd: string) => void;
  onExit: (leafId: number, code: number) => void;
};

type Props = {
  tabId: number;
  node: PaneNode;
  tabVisible: boolean;
  activeLeafId: number;
  zoomedLeafId?: number;
  blocks: boolean;
  onFocusLeaf: (leafId: number) => void;
  getBundle: (leafId: number) => LeafBundle;
};

/**
 * A terminal tab's panes. They are laid out by the tuios-style TiledLayout;
 * each pane's contents (focus tracking, the terminal, the drop overlay) are
 * what this file has always drawn for a leaf.
 */
export function PaneTreeView(props: Props) {
  return (
    <TiledLayout
      tabId={props.tabId}
      node={props.node}
      activeLeafId={props.activeLeafId}
      zoomedLeafId={props.zoomedLeafId}
      renderLeaf={(leafId, focused) => (
        <PaneLeaf {...props} leafId={leafId} focused={focused} />
      )}
    />
  );
}

function PaneLeaf({
  leafId,
  focused,
  tabVisible,
  blocks,
  onFocusLeaf,
  getBundle,
  node,
}: Props & { leafId: number; focused: boolean }) {
  const b = getBundle(leafId);
  const leaf = findLeaf(node, leafId);
  return (
    <div
      onMouseDownCapture={() => {
        if (!focused) onFocusLeaf(leafId);
      }}
      // Catches focus from Tab, programmatic focus, or any path that
      // skips mousedown — keeps activeLeafId in sync with DOM focus.
      onFocus={() => {
        if (!focused) onFocusLeaf(leafId);
      }}
      data-pane-leaf={leafId}
      className="relative h-full w-full"
    >
      <TerminalPane
        leafId={leafId}
        visible={tabVisible}
        focused={focused}
        initialCwd={leaf?.cwd}
        blocks={blocks}
        ref={b.setRef}
        onSearchReady={b.onSearchReady}
        onCwd={b.onCwd}
        onExit={b.onExit}
      />
      <DropOverlay leafId={leafId} />
    </div>
  );
}

function findLeaf(
  node: PaneNode,
  id: number,
): Extract<PaneNode, { kind: "leaf" }> | null {
  if (node.kind === "leaf") return node.id === id ? node : null;
  for (const child of node.children) {
    const found = findLeaf(child, id);
    if (found) return found;
  }
  return null;
}

function DropOverlay({ leafId }: { leafId: number }) {
  const active = useTerminalDropStore((s) => s.targetLeafId === leafId);
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-2 grid place-items-center rounded-lg border border-primary/45 bg-background/70 text-xs font-medium text-foreground shadow-lg backdrop-blur-sm">
      Drop file path here
    </div>
  );
}
