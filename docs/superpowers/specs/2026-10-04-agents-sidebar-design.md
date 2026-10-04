# Terax Tiling, project 3: agents section in the sidebar

Date: 2026-10-04 · Branch: `tuios-tiling-v086` (Terax 0.8.6) · Status: approved in conversation

## Goal

A tuios-style list of the coding agents running in terminal panes (Claude Code,
Codex, Gemini CLI, …), pinned at the bottom of the sidebar, so you can see at a
glance which ones are working, which need you, and jump to any of them.

Not in scope: Terax's built-in AI agents, tuios's `@` agent-mail filter.

## Data (no new detection)

- `useAgentActivityStore` — per PTY: agent name (`agents`) and phase
  (`working | attention | finished | idle`), from Terax's OSC 777 detector.
- `useAgentStore.sessions` — per pane: `startedAt`, `attentionSince`.
- `ptyIdForLeaf(leafId)` maps a pane to its PTY.

`listAgents(input)` (pure, tested) walks every terminal tab's panes in tab
order and returns one row per pane with a known agent:
`{ leafId, tabId, agent, state, place, since, focused }`.

- `state`: the PTY's phase; without one, a session's `waiting` → attention, a
  session → working, otherwise idle.
- `place`: `<tab label> › <pane number>` (custom title over title).
- `since`: `attentionSince` when it needs you, `startedAt` when working.
- `focused`: the active tab's active pane.
- Order: attention, working, finished, idle; stable by tab and pane order.
- Filter `you`: attention only.

## View

Pinned between the Files/Git view and the sidebar's tab bar; hidden when no
agent runs. Monospace, terminal-style:

```
agents   all · you                 »
▎◐ claude   terax › 1         2m
 ● codex    api › 2     needs you
```

Glyphs and colours follow tuios: ◐ working (blue), ● needs you (amber, with an
amber gutter bar), ✓ finished (green), ○ idle (muted). The focused pane's row
has a `▎` gutter in the primary colour. The header collapses the list.
Clicking a row calls Terax's `activateAgentTarget(tabId, leafId)` (switches
Space if needed). Elapsed time updates every second while a row needs it.

Finished rows stay green until Terax's own finished→idle timeout turns them
idle (tuios's separate "seen" state is not reproduced).

## Files

- New: `src/modules/agents/sidebar/listAgents.ts` (+ test), `AgentsSection.tsx`
- Changed: `src/app/App.tsx` (render the section, pass the jump)

## Testing

`listAgents`: mapping, state fallbacks, ordering, filter, focus, panes without
a PTY or agent, private/other-space tabs. `formatElapsed`: s/m/h. Then a build.
