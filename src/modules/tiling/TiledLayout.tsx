import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useAgentActivityStore } from "@/modules/terminal/lib/agentActivity";
import {
  findLeafCwd,
  type PaneId,
  type PaneNode,
} from "@/modules/terminal/lib/panes";
import { ptyIdForLeaf } from "@/modules/terminal/lib/useTerminalSession";
import { useTilingActionsStore } from "./lib/actionsStore";
import { type Divider, layoutTiles, type TileRect } from "./lib/layout";
import { useTilingLayoutStore } from "./lib/layoutStore";
import {
  beginTerminalResizeInteraction,
  endTerminalResizeInteraction,
} from "./lib/resizeHold";
import { planTiles, shouldAnimate, type TilePlanItem } from "./lib/tilePlan";
import { TileWindow } from "./TileWindow";

type Props = {
  tabId: number;
  node: PaneNode;
  activeLeafId: number;
  zoomedLeafId?: PaneId;
  /** The terminal (and its overlays) for one pane. */
  renderLeaf: (leafId: PaneId, focused: boolean) => ReactNode;
};

const FALLBACK_DURATION_MS = 240;

function animationDurationMs(): number {
  if (typeof window === "undefined") return FALLBACK_DURATION_MS;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--dur-base")
    .trim();
  const ms = raw.endsWith("ms")
    ? Number.parseFloat(raw)
    : raw.endsWith("s")
      ? Number.parseFloat(raw) * 1000
      : Number.NaN;
  return Number.isFinite(ms) ? ms : FALLBACK_DURATION_MS;
}

function usePrefersReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function basename(path: string | undefined): string {
  if (!path) return "terminal";
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function AgentBadge({ leafId }: { leafId: PaneId }) {
  const ptyId = ptyIdForLeaf(leafId);
  const phase = useAgentActivityStore((s) =>
    ptyId === null ? undefined : s.phases[ptyId],
  );
  const agent = useAgentActivityStore((s) =>
    ptyId === null ? undefined : s.agents[ptyId],
  );
  if (!phase || phase === "idle") return null;
  const mark = phase === "working" ? "◐" : phase === "attention" ? "●" : "✓";
  const label =
    phase === "working"
      ? "working"
      : phase === "attention"
        ? "needs you"
        : "done";
  return (
    <span
      className="shrink-0 font-mono text-[10px]"
      title={`${agent ?? "agent"}: ${label}`}
    >
      {mark} {agent ?? label}
    </span>
  );
}

/**
 * A terminal tab's panes, tiled the tuios way: each pane is a window placed
 * by layoutTiles, drawn as one flat list keyed by pane id, so a change in the
 * tree moves windows instead of recreating terminals. Changes animate, and
 * while they do the terminals hold their size, to be fitted once at the end.
 */
export function TiledLayout({
  tabId,
  node,
  activeLeafId,
  zoomedLeafId,
  renderLeaf,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const width = Math.round(el.clientWidth);
      const height = Math.round(el.clientHeight);
      setSize((s) =>
        s.width === width && s.height === height ? s : { width, height },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const gap = usePreferencesStore((s) => s.tilingGap);
  const titleBars = usePreferencesStore((s) => s.tilingTitleBars);
  const dim = usePreferencesStore((s) => s.tilingDimUnfocused);
  const animationsOn = usePreferencesStore((s) => s.tilingAnimations);
  const reducedMotion = usePrefersReducedMotion();
  const actions = useTilingActionsStore((s) => s.actions);

  const { tiles, dividers } = useMemo(
    () =>
      layoutTiles(
        node,
        { x: 0, y: 0, width: size.width, height: size.height },
        gap,
        zoomedLeafId,
      ),
    [node, size, gap, zoomedLeafId],
  );

  // The layout last committed, to animate from. Updated after each commit.
  const prevRef = useRef<{
    tiles: TileRect[];
    width: number;
    height: number;
  } | null>(null);
  const prev = prevRef.current;
  const ready = size.width > 0 && size.height > 0;
  const sizeChanged =
    !prev || prev.width !== size.width || prev.height !== size.height;
  const [dragging, setDragging] = useState(false);
  const animate = shouldAnimate({
    ready,
    animationsOn,
    reducedMotion,
    sizeChanged,
    dragging,
  });

  const items = planTiles(
    animate && prev ? prev.tiles : null,
    tiles,
    activeLeafId,
    [],
  );

  // Closed panes leave a ghost frame that shrinks away.
  const [ghosts, setGhosts] = useState<TilePlanItem[]>([]);
  const layoutKey = tiles
    .map((t) => `${t.id}:${t.x},${t.y},${t.width},${t.height},${t.hidden}`)
    .join("|");
  const tokenRef = useRef({});
  // biome-ignore lint/correctness/useExhaustiveDependencies: layoutKey stands in for `tiles`, a new array on every layout; the rest is read at the moment the layout changes.
  useEffect(() => {
    if (!ready) return;
    const before = prevRef.current;
    prevRef.current = { tiles, width: size.width, height: size.height };
    if (!animate || !before) return;
    const gone = before.tiles
      .filter((p) => !tiles.some((t) => t.id === p.id))
      .map((p) => p.id);
    const duration = animationDurationMs() + 40;
    if (gone.length > 0) {
      const fresh = planTiles(before.tiles, [], activeLeafId, gone);
      setGhosts((g) => [...g, ...fresh]);
      window.setTimeout(() => {
        setGhosts((g) => g.filter((x) => !fresh.includes(x)));
      }, duration);
    }
    // Hold the terminals at their size until the windows stop moving.
    const token = tokenRef.current;
    beginTerminalResizeInteraction(token);
    const end = window.setTimeout(
      () => endTerminalResizeInteraction(token),
      duration,
    );
    // A newer layout (an animated one begins again; a resize doesn't) must
    // not leave the terminals held at their old size.
    return () => {
      window.clearTimeout(end);
      endTerminalResizeInteraction(token);
    };
  }, [layoutKey, ready]);

  useEffect(() => () => endTerminalResizeInteraction(tokenRef.current), []);

  useEffect(() => {
    if (!ready) return;
    useTilingLayoutStore
      .getState()
      .setLayout(tabId, { tiles, dividers, gap, ...size });
  }, [tabId, tiles, dividers, gap, size, ready]);
  useEffect(() => () => useTilingLayoutStore.getState().clear(tabId), [tabId]);

  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden">
      {ready &&
        [...items, ...ghosts].map((item) => (
          <TileWindow
            key={item.key}
            rect={item.rect}
            from={item.from}
            animate={animate || item.ghost}
            hidden={item.hidden}
            focused={item.focused}
            ghost={item.ghost}
            titleBar={titleBars}
            dim={dim}
            title={basename(findLeafCwd(node, item.id))}
            badge={item.ghost ? null : <AgentBadge leafId={item.id} />}
            onClose={() => actions.closeLeaf(item.id)}
            onZoom={() => actions.toggleZoom(tabId, item.id)}
          >
            {item.ghost ? null : renderLeaf(item.id, item.focused)}
          </TileWindow>
        ))}
      {ready &&
        dividers.map((d) => (
          <DividerHandle
            key={`${d.splitId}:${d.index}`}
            divider={d}
            onDragging={setDragging}
            onDrag={(deltaPx) => actions.adjustDivider(tabId, d, deltaPx)}
            onReset={() => actions.resetDivider(tabId, d.splitId)}
          />
        ))}
    </div>
  );
}

const MIN_HANDLE_PX = 8;

function DividerHandle({
  divider,
  onDragging,
  onDrag,
  onReset,
}: {
  divider: Divider;
  onDragging: (dragging: boolean) => void;
  onDrag: (deltaPx: number) => void;
  onReset: () => void;
}) {
  const row = divider.dir === "row";
  const { rect } = divider;
  const thickness = Math.max(MIN_HANDLE_PX, row ? rect.width : rect.height);
  const offset = ((row ? rect.width : rect.height) - thickness) / 2;
  const last = useRef<number | null>(null);
  const token = useRef({});

  const stop = () => {
    if (last.current === null) return;
    last.current = null;
    onDragging(false);
    endTerminalResizeInteraction(token.current);
  };

  return (
    <div
      aria-hidden
      className={
        row ? "absolute cursor-col-resize" : "absolute cursor-row-resize"
      }
      style={
        row
          ? {
              left: rect.x + offset,
              top: rect.y,
              width: thickness,
              height: rect.height,
            }
          : {
              left: rect.x,
              top: rect.y + offset,
              width: rect.width,
              height: thickness,
            }
      }
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        last.current = row ? e.clientX : e.clientY;
        onDragging(true);
        beginTerminalResizeInteraction(token.current);
      }}
      onPointerMove={(e) => {
        if (last.current === null) return;
        const now = row ? e.clientX : e.clientY;
        const delta = now - last.current;
        if (delta === 0) return;
        last.current = now;
        onDrag(delta);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onDoubleClick={onReset}
    />
  );
}
