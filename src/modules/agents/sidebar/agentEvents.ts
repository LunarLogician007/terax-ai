import type { MessageKind } from "@/modules/messages/lib/messages";
import type { AgentRow, AgentRowState } from "./listAgents";

/** States worth a message in the top bar when an agent enters them. */
const ANNOUNCED: ReadonlySet<AgentRowState> = new Set([
  "attention",
  "finished",
]);

/**
 * The rows whose agent just entered a state worth announcing (needs input,
 * finished its turn), given each pane's state from the previous look.
 */
export function agentEvents(
  prev: ReadonlyMap<number, AgentRowState>,
  rows: readonly AgentRow[],
): AgentRow[] {
  return rows.filter(
    (r) => ANNOUNCED.has(r.state) && prev.get(r.leafId) !== r.state,
  );
}

/** The top-bar message for an agent event. */
export function agentMessage(row: AgentRow): {
  text: string;
  kind: MessageKind;
} {
  return row.state === "attention"
    ? {
        text: `${row.agent} in ${row.place}: user input needed.`,
        kind: "warning",
      }
    : {
        text: `${row.agent} in ${row.place} finished its turn.`,
        kind: "success",
      };
}
