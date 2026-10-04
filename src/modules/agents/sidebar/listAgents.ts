import type { AgentSession } from "@/modules/agents/lib/types";
import type { Tab } from "@/modules/tabs/lib/useTabs";
import type { AgentPhase } from "@/modules/terminal/lib/agentActivity";
import { leafIds } from "@/modules/terminal/lib/panes";

export type AgentRowState = "attention" | "working" | "finished" | "idle";

/** One coding agent, in one terminal pane. */
export type AgentRow = {
  leafId: number;
  tabId: number;
  agent: string;
  state: AgentRowState;
  /** Where it runs: "<tab label> › <pane number>". */
  place: string;
  /** When it started needing you, or started working; null otherwise. */
  since: number | null;
  /** The pane you are in right now. */
  focused: boolean;
};

export type AgentFilter = "all" | "you";

export type ListAgentsInput = {
  tabs: readonly Tab[];
  activeTabId: number;
  ptyIdForLeaf: (leafId: number) => number | null;
  /** Per PTY, from Terax's agent detector. */
  phases: Record<number, AgentPhase>;
  agents: Record<number, string>;
  /** Per pane, with timings. */
  sessions: Record<number, AgentSession>;
  filter?: AgentFilter;
};

const ORDER: Record<AgentRowState, number> = {
  attention: 0,
  working: 1,
  finished: 2,
  idle: 3,
};

function stateOf(
  phase: AgentPhase | undefined,
  session: AgentSession | undefined,
): AgentRowState {
  if (phase) return phase;
  if (session?.status === "waiting") return "attention";
  if (session) return "working";
  return "idle";
}

/**
 * The agents section's rows: every terminal pane running a coding agent, the
 * ones that need you first, then working, finished and idle, each group in
 * tab and pane order.
 */
export function listAgents(input: ListAgentsInput): AgentRow[] {
  const rows: AgentRow[] = [];
  for (const tab of input.tabs) {
    if (tab.kind !== "terminal") continue;
    const label = tab.customTitle || tab.title;
    leafIds(tab.paneTree).forEach((leafId, index) => {
      const ptyId = input.ptyIdForLeaf(leafId);
      if (ptyId === null) return;
      const session = input.sessions[leafId];
      const agent = input.agents[ptyId] ?? session?.agent;
      if (!agent) return;
      const state = stateOf(input.phases[ptyId], session);
      const since =
        state === "attention"
          ? (session?.attentionSince ?? null)
          : state === "working"
            ? (session?.startedAt ?? null)
            : null;
      rows.push({
        leafId,
        tabId: tab.id,
        agent,
        state,
        place: `${label} › ${index + 1}`,
        since,
        focused: tab.id === input.activeTabId && leafId === tab.activeLeafId,
      });
    });
  }
  const shown =
    input.filter === "you" ? rows.filter((r) => r.state === "attention") : rows;
  // Array.prototype.sort is stable, so tab and pane order holds within a state.
  return shown.sort((a, b) => ORDER[a.state] - ORDER[b.state]);
}

/** Elapsed time the way tuios shows it: 42s, 7m, 1h3m. */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60}m`;
}

const STATUS: Record<AgentRowState, string> = {
  working: "Works on a turn.",
  attention: "User input needed.",
  finished: "Finished its turn.",
  idle: "Idle.",
};

/** The second line of an agent's row: what it is doing, tuios-style. */
export function statusLine(state: AgentRowState): string {
  return STATUS[state];
}
