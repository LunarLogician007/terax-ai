import { useEffect, useMemo, useRef, useState } from "react";
import { postMessage } from "@/modules/messages/lib/messages";
import { agentEvents, agentMessage } from "./agentEvents";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import type { Tab } from "@/modules/tabs/lib/useTabs";
import { useAgentActivityStore } from "@/modules/terminal/lib/agentActivity";
import { ptyIdForLeaf } from "@/modules/terminal/lib/useTerminalSession";
import {
  type AgentFilter,
  type AgentRow,
  type AgentRowState,
  formatElapsed,
  listAgents,
  statusLine,
} from "./listAgents";

type Props = {
  tabs: readonly Tab[];
  activeTabId: number;
  /** Go to the agent's tab and pane (Terax's activateAgentTarget). */
  onJump: (tabId: number, leafId: number) => void;
};

// tuios's glyphs and colours: blue working, amber needs you, green done.
// tuios's row: a coloured dot, then a status line underneath.
const GLYPH: Record<AgentRowState, string> = {
  attention: "●",
  working: "●",
  finished: "●",
  idle: "○",
};
const COLOR: Record<AgentRowState, string> = {
  attention: "text-amber-500",
  working: "text-sky-500",
  finished: "text-emerald-500",
  idle: "text-muted-foreground",
};

/**
 * The coding agents running in terminal panes, pinned at the bottom of the
 * sidebar like tuios's agents section. Hidden while no agent is running.
 */
export function AgentsSection({ tabs, activeTabId, onJump }: Props) {
  const phases = useAgentActivityStore((s) => s.phases);
  const agents = useAgentActivityStore((s) => s.agents);
  const sessions = useAgentStore((s) => s.sessions);
  const [filter, setFilter] = useState<AgentFilter>("all");
  const [collapsed, setCollapsed] = useState(false);

  const all = useMemo(
    () =>
      listAgents({
        tabs,
        activeTabId,
        ptyIdForLeaf,
        phases,
        agents,
        sessions,
      }),
    [tabs, activeTabId, phases, agents, sessions],
  );
  const rows =
    filter === "you" ? all.filter((r) => r.state === "attention") : all;
  const waiting = all.filter((r) => r.state === "attention").length;

  // Elapsed times tick once a second, only while one is on screen.
  const ticking = !collapsed && rows.some((r) => r.since !== null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [ticking]);

  // Terax Tiling: an agent that starts needing input, or finishes its turn,
  // says so in the top bar's message line (click jumps to its pane).
  const seen = useRef<Map<number, AgentRowState> | null>(null);
  useEffect(() => {
    const prev = seen.current;
    seen.current = new Map(all.map((r) => [r.leafId, r.state]));
    // The first look only records: agents already running at start are not
    // news.
    if (prev === null) return;
    for (const row of agentEvents(prev, all)) {
      postMessage({
        ...agentMessage(row),
        key: `agent:${row.leafId}`,
        target: { tabId: row.tabId, leafId: row.leafId },
      });
    }
  }, [all]);

  if (all.length === 0) return null;

  return (
    <section className="shrink-0 border-t border-border/60 px-1.5 pb-1.5 pt-1 font-mono text-[11.5px] leading-5">
      <div className="flex items-center gap-2 px-1 text-muted-foreground">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="hover:text-foreground"
          aria-expanded={!collapsed}
          title={collapsed ? "Show agents" : "Hide agents"}
        >
          agents
        </button>
        <span className="flex items-center gap-1">
          <FilterButton
            active={filter === "all"}
            onClick={() => setFilter("all")}
          >
            all
          </FilterButton>
          <span aria-hidden>·</span>
          <FilterButton
            active={filter === "you"}
            onClick={() => setFilter("you")}
          >
            you{waiting > 0 ? ` ${waiting}` : ""}
          </FilterButton>
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="ml-auto hover:text-foreground"
          aria-label={collapsed ? "Show agents" : "Hide agents"}
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>
      {!collapsed && (
        <ul className="mt-0.5 max-h-48 overflow-y-auto">
          {rows.map((row) => (
            <AgentRowView
              key={row.leafId}
              row={row}
              now={now}
              onJump={onJump}
            />
          ))}
          {rows.length === 0 && (
            <li className="px-2 text-muted-foreground">nothing needs you</li>
          )}
        </ul>
      )}
    </section>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "hover:text-foreground",
        active && "text-foreground underline underline-offset-2",
      )}
    >
      {children}
    </button>
  );
}

function AgentRowView({
  row,
  now,
  onJump,
}: {
  row: AgentRow;
  now: number;
  onJump: (tabId: number, leafId: number) => void;
}) {
  const elapsed = row.since !== null ? formatElapsed(now - row.since) : "";
  const attention = row.state === "attention";
  return (
    <li>
      <button
        type="button"
        onClick={() => onJump(row.tabId, row.leafId)}
        className="group flex w-full items-stretch gap-1.5 rounded-sm py-0.5 pr-1 text-left hover:bg-accent/60"
        title={`${row.agent} in ${row.place}`}
      >
        {/* The gutter: where you are, or that this one needs a human. */}
        <span
          aria-hidden
          className={cn(
            "w-0.5 shrink-0 rounded-full",
            row.focused
              ? "bg-amber-400"
              : attention
                ? "bg-amber-500/70"
                : "bg-transparent",
          )}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5">
            <span className={cn("shrink-0", COLOR[row.state])}>
              {GLYPH[row.state]}
            </span>
            <span className="shrink-0 text-foreground">{row.agent}</span>
            <span className="ml-auto min-w-0 truncate text-[10.5px] text-muted-foreground">
              {row.place}
            </span>
          </span>
          <span
            className={cn(
              "flex items-center gap-2 pl-4",
              attention ? "text-amber-500" : "text-muted-foreground",
            )}
          >
            <span className="truncate">{statusLine(row.state)}</span>
            {elapsed && (
              <span className="ml-auto shrink-0 tabular-nums">{elapsed}</span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}
