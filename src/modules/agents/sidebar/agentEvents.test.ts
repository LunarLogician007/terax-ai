import { describe, expect, it } from "vitest";
import { agentEvents, agentMessage } from "./agentEvents";
import type { AgentRow } from "./listAgents";

const row = (
  leafId: number,
  state: AgentRow["state"],
  place = `t › ${leafId}`,
): AgentRow => ({
  leafId,
  tabId: 1,
  agent: "claude",
  state,
  place,
  since: null,
  focused: false,
});

describe("agentEvents", () => {
  it("reports an agent that starts needing input or finishes a turn", () => {
    const prev = new Map<number, AgentRow["state"]>([
      [1, "working"],
      [2, "working"],
    ]);
    const events = agentEvents(prev, [row(1, "attention"), row(2, "finished")]);
    expect(events.map((e) => [e.leafId, e.state])).toEqual([
      [1, "attention"],
      [2, "finished"],
    ]);
  });

  it("says nothing when the state did not change, or for working and idle", () => {
    const prev = new Map<number, AgentRow["state"]>([
      [1, "attention"],
      [2, "idle"],
    ]);
    expect(
      agentEvents(prev, [
        row(1, "attention"),
        row(2, "working"),
        row(3, "idle"),
      ]),
    ).toEqual([]);
  });

  it("an agent seen for the first time already waiting is reported", () => {
    expect(
      agentEvents(new Map(), [row(4, "attention")]).map((e) => e.leafId),
    ).toEqual([4]);
  });
});

describe("agentMessage", () => {
  it("names the agent and the pane", () => {
    expect(agentMessage(row(2, "attention", "terax › 2"))).toEqual({
      text: "claude in terax › 2: user input needed.",
      kind: "warning",
    });
    expect(agentMessage(row(2, "finished", "terax › 2"))).toEqual({
      text: "claude in terax › 2 finished its turn.",
      kind: "success",
    });
  });
});
