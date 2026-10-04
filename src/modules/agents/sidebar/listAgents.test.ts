import { describe, expect, it } from "vitest";
import type { AgentSession } from "@/modules/agents/lib/types";
import type { Tab } from "@/modules/tabs/lib/useTabs";
import type { PaneNode } from "@/modules/terminal/lib/panes";
import { formatElapsed, listAgents } from "./listAgents";

const leaf = (id: number): PaneNode => ({ kind: "leaf", id });
const row = (...ids: number[]): PaneNode => ({
  kind: "split",
  id: 900 + ids[0],
  dir: "row",
  children: ids.map(leaf),
});
const term = (
  id: number,
  paneTree: PaneNode,
  activeLeafId: number,
  extra: Record<string, unknown> = {},
): Tab =>
  ({
    id,
    kind: "terminal",
    title: `tab${id}`,
    paneTree,
    activeLeafId,
    spaceId: "s1",
    ...extra,
  }) as Tab;
const session = (
  leafId: number,
  status: AgentSession["status"],
  startedAt: number,
  attentionSince: number | null = null,
): AgentSession => ({
  leafId,
  tabId: 0,
  agent: "claude",
  status,
  startedAt,
  lastActivityAt: startedAt,
  attentionSince,
});
// pty id = leaf id + 100 in these fixtures
const pty = (leafId: number) => leafId + 100;

describe("listAgents", () => {
  it("lists one row per pane with a known agent, skipping the rest", () => {
    const rows = listAgents({
      tabs: [term(1, row(1, 2, 3), 1)],
      activeTabId: 1,
      ptyIdForLeaf: (l) => (l === 3 ? null : pty(l)),
      phases: { 101: "working" },
      agents: { 101: "claude" },
      sessions: {},
    });
    expect(rows.map((r) => [r.leafId, r.agent, r.state])).toEqual([
      [1, "claude", "working"],
    ]);
  });

  it("uses the PTY phase, else falls back to the session, else idle", () => {
    const rows = listAgents({
      tabs: [term(1, row(1, 2, 3), 9)],
      activeTabId: 1,
      ptyIdForLeaf: pty,
      phases: { 101: "finished" },
      agents: { 101: "claude", 102: "codex", 103: "gemini" },
      sessions: { 2: session(2, "waiting", 0, 50) },
    });
    const byAgent = Object.fromEntries(rows.map((r) => [r.agent, r.state]));
    expect(byAgent).toEqual({
      claude: "finished",
      codex: "attention",
      gemini: "idle",
    });
  });

  it("takes the agent name from the session when the PTY has none yet", () => {
    const rows = listAgents({
      tabs: [term(1, leaf(1), 1)],
      activeTabId: 1,
      ptyIdForLeaf: pty,
      phases: {},
      agents: {},
      sessions: { 1: session(1, "working", 10) },
    });
    expect(rows).toMatchObject([
      { agent: "claude", state: "working", since: 10 },
    ]);
  });

  it("orders needs-you first, then working, finished, idle, stable by tab and pane", () => {
    const rows = listAgents({
      tabs: [term(1, row(1, 2), 1), term(2, row(3, 4), 3)],
      activeTabId: 1,
      ptyIdForLeaf: pty,
      phases: { 101: "idle", 102: "working", 103: "attention", 104: "working" },
      agents: { 101: "a", 102: "b", 103: "c", 104: "d" },
      sessions: {},
    });
    expect(rows.map((r) => r.agent)).toEqual(["c", "b", "d", "a"]);
  });

  it("the 'you' filter keeps only agents that need you", () => {
    const rows = listAgents({
      tabs: [term(1, row(1, 2), 1)],
      activeTabId: 1,
      ptyIdForLeaf: pty,
      phases: { 101: "attention", 102: "working" },
      agents: { 101: "a", 102: "b" },
      sessions: {},
      filter: "you",
    });
    expect(rows.map((r) => r.agent)).toEqual(["a"]);
  });

  it("marks only the active tab's active pane as focused", () => {
    const rows = listAgents({
      tabs: [term(1, row(1, 2), 2), term(2, leaf(3), 3)],
      activeTabId: 1,
      ptyIdForLeaf: pty,
      phases: { 101: "working", 102: "working", 103: "working" },
      agents: { 101: "a", 102: "b", 103: "c" },
      sessions: {},
    });
    expect(rows.filter((r) => r.focused).map((r) => r.agent)).toEqual(["b"]);
  });

  it("names the place by tab label and pane number, preferring a custom title", () => {
    const rows = listAgents({
      tabs: [term(1, row(1, 2), 1, { customTitle: "api" })],
      activeTabId: 1,
      ptyIdForLeaf: pty,
      phases: { 102: "working" },
      agents: { 102: "b" },
      sessions: {},
    });
    expect(rows[0]).toMatchObject({ place: "api › 2", tabId: 1, leafId: 2 });
  });

  it("since is when it started needing you, or when it started working", () => {
    const rows = listAgents({
      tabs: [term(1, row(1, 2), 1)],
      activeTabId: 1,
      ptyIdForLeaf: pty,
      phases: { 101: "attention", 102: "working" },
      agents: { 101: "a", 102: "b" },
      sessions: {
        1: session(1, "waiting", 5, 70),
        2: session(2, "working", 30),
      },
    });
    expect(rows.map((r) => [r.agent, r.since])).toEqual([
      ["a", 70],
      ["b", 30],
    ]);
  });

  it("ignores tabs that aren't terminals", () => {
    const rows = listAgents({
      tabs: [
        { id: 5, kind: "editor", title: "x", path: "/x" } as unknown as Tab,
      ],
      activeTabId: 5,
      ptyIdForLeaf: pty,
      phases: {},
      agents: {},
      sessions: {},
    });
    expect(rows).toEqual([]);
  });
});

describe("formatElapsed", () => {
  it("reads like tuios: seconds, minutes, hours", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(59_000)).toBe("59s");
    expect(formatElapsed(60_000)).toBe("1m");
    expect(formatElapsed(59 * 60_000)).toBe("59m");
    expect(formatElapsed(63 * 60_000)).toBe("1h3m");
    expect(formatElapsed(-5)).toBe("0s");
  });
});
