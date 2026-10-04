# Agents sidebar: implementation plan

Spec: `docs/superpowers/specs/2026-10-04-agents-sidebar-design.md`
Branch: `tuios-tiling-v086`. Tests: vitest (node), pure logic only, as Terax does.

1. **`listAgents` + `formatElapsed`** (`src/modules/agents/sidebar/listAgents.ts`)
   - Tests first: one row per pane with a known agent; PTY phase wins; session
     fallbacks (waiting → attention, session → working, else idle); panes with
     no PTY or no agent are skipped; order attention → working → finished →
     idle, stable by tab/pane; `you` filter; `focused` only for the active
     tab's active pane; `place` uses custom title; `since` per state;
     `formatElapsed` 0–59 s, minutes, hours.
2. **`AgentsSection`** (`src/modules/agents/sidebar/AgentsSection.tsx`) and
   wiring in `App.tsx` between the sidebar view and `SidebarRail`; row click
   → `activateAgentTarget`; 1 s ticker only while a row shows elapsed time;
   collapse state in component state.
3. **Checks and delivery**: `pnpm test`, `check-types`, `lint` (no new
   warnings over the 0.8.6 baseline of 103), `build`; commit, push,
   fork-build, install, hand over.
