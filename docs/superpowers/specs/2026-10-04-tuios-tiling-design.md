# Terax Tiling, project 1: tuios-style tiling and window look

Date: 2026-10-04
Branch: `tuios-tiling` (fork of crynta/terax-ai at `3301de2`)
Status: design approved in conversation; this spec is waiting for review

## 1. Goal

Bring the tiling of [tuios](https://github.com/Gaurav-Gosain/tuios) to terax's
terminal tabs. That means automatic BSP placement, panes drawn as separate
windows with gaps, rounded corners and title bars, smooth animations, and a
Ctrl+B keyboard layer. Everything else in terax stays as it is.

This is the first of three projects in the fork, built in this order:

1. **Tiling and window look** (this spec)
2. Theme: a semi-transparent window and a terminal-style sidebar (separate spec)
3. An agents section in the sidebar, like tuios (separate spec)

### Not in this project

- Tiling for editor, markdown or preview tabs. Tiling applies to terminals
  inside a terminal tab only; the other tabs stay full tabs, as they are today.
- Master-stack and scrolling layouts. BSP only.
- Changes to terax's Spaces, sidebar, editor or markdown viewer.
- The theme and agent work (projects 2 and 3).

## 2. What exists today in terax

- `src/modules/terminal/lib/panes.ts` (289 lines): `PaneNode` is either a leaf
  or a split with `dir: "row" | "col"` and `children`. It has `splitLeaf`,
  `removeLeaf`, `siblingLeafOf`, `swapLeafInDirection` and the geometry types
  `PaneBounds` and `PaneDirection`.
- `splitLeaf` appends the new leaf to the parent when the parent already
  splits in the same direction, so the tree is n-ary.
- `src/modules/terminal/PaneTreeView.tsx` (146 lines) draws the tree with nested
  `ResizablePanelGroup`/`ResizablePanel`. Split sizes live in the panel
  library, not in the tree.
- Terminals are attached through "slots" (`firstLeafSlotId`), so a terminal is
  not recreated just because the tree changes.
- `TerminalTab` (`src/modules/tabs/lib/useTabs.ts`) holds `paneTree` and
  `activeLeafId`.
- Spaces save terminal tabs as `SerializedNode` trees
  (`src/modules/spaces/lib/serialize.ts`).
- Global shortcuts listen to `keydown` in the capture phase
  (`src/modules/shortcuts/lib/useGlobalShortcuts.ts`), so they see a key before
  the Ghostty terminal's input element does.
- Existing pane shortcuts: Cmd+D split right, Cmd+Shift+D split down,
  Cmd+] / Cmd+[ cycle focus, Cmd+Opt+arrows swap.
- Agent state per pane comes from `src/modules/terminal/lib/agentActivity.ts`
  (`working | attention | finished | idle`) and the agents stores.
- Tests use vitest (`pnpm test`); checks are `tsc`, biome and `size-limit`.

## 3. Design

### 3.1 Layout model

The `PaneNode` tree stays the single source of truth. Two additions:

- Split nodes get an optional `sizes?: number[]`, one share per child, summing
  to 1. A missing or invalid `sizes` means equal shares.
- `TerminalTab` gets an optional `zoomedLeafId?: PaneId`. It is runtime state
  only and is not saved.

New pure functions in `src/modules/tiling/lib/`:

| Function | Purpose |
|---|---|
| `layoutRects(tree, bounds, gap, zoomedLeafId?)` | Each leaf's rectangle in pixels. Children divide the parent along `dir` by `sizes`, with `gap` between siblings and around the outside. Rounded to whole pixels so neighbours share edges exactly. With a zoomed leaf, that leaf gets the full inner bounds and the others are marked hidden. |
| `splitLeafBinary(tree, targetId, newSplitId, newLeafId, dir, cwd?)` | Replace the target leaf with a two-child split (`[target, new]`, sizes `[0.5, 0.5]`), whatever the parent's direction. Used by BSP. The existing `splitLeaf` stays for Cmd+D. |
| `spiralDirection(tree, targetId, targetRect)` | tuios's default "spiral" rule. The axis alternates with the depth of the target leaf. The axis at even depth is chosen from the tab's shape: side by side (`row`) when its width in pixels is at least its height, stacked (`col`) otherwise. |
| `removeLeafAndCollapse(tree, leafId)` | Remove a leaf, renormalise the parent's `sizes`, and collapse any split left with one child. Built on `removeLeaf`. |
| `neighbourInDirection(rects, fromId, dir)` | The nearest leaf whose rectangle lies in that direction and overlaps on the other axis. Ties go to the one with the largest overlap, then the closest. |
| `resizeInDirection(tree, rects, leafId, dir, step)` | Move the divider of the nearest ancestor split on that axis by `step` (default 5% of that split). Every child keeps at least the minimum size. Returns the tree unchanged if it can't move. |

Swaps reuse the existing `swapLeafInDirection`, given rectangles from
`layoutRects`.

### 3.2 Behaviour

- **New terminal** (Ctrl+B Enter) splits the focused leaf with `splitLeafBinary`
  along `spiralDirection`. The new terminal takes the focused leaf's working
  folder and gets focus. Any zoom ends.
- **Close** (Ctrl+B x, or the shell exiting) goes through terax's existing
  close path, so its prompts still apply, then `removeLeafAndCollapse`. Focus
  moves to the leaf that took the space. Closing the last leaf closes the tab,
  as it does today.
- **Focus** (h/j/k/l) uses `neighbourInDirection`. With no neighbour, nothing
  happens.
- **Swap** (H/J/K/L) uses `swapLeafInDirection`. The terminals keep their
  shells; only their positions change.
- **Resize** (`<` `>` for the side-by-side axis, `-` `+` for the stacked axis)
  uses `resizeInDirection`.
- **Zoom** (z) toggles `zoomedLeafId`. Changing focus, opening a terminal or
  closing one ends the zoom.
- Cmd+D, Cmd+Shift+D, Cmd+] and Cmd+[ keep working on the same tree.

### 3.3 Renderer and window look

`src/modules/tiling/TiledLayout.tsx` replaces the nested panel groups inside
`PaneTreeView`.

- It measures the tab area with a `ResizeObserver`, calls `layoutRects`, and
  draws one **flat list** of `TileWindow` elements, each positioned absolutely
  and keyed by leaf ID. A change in the tree's shape therefore never recreates
  a terminal.
- `TileWindow` (`src/modules/tiling/TileWindow.tsx`) is a window frame around the
  existing `TerminalPane`:
  - a 1 px border with terax's `--radius-lg` corners;
  - a title bar about 24 px tall, with close and zoom dots on the left (tuios's
    default), the terminal title (or the folder name), and an agent badge
    (◐ working, ● needs attention, ✓ finished) read from the existing agent
    stores;
  - the focused window's border and title in `--accent`; the others slightly
    dimmed (opacity on the content, about 0.85).
- A single pane shows the same frame.
- Gap: 6 px between windows and around the edge by default.
- Mouse: drag the gap between two siblings to resize them, which updates
  `sizes`. Double-click the gap to reset that split to equal. Click a title bar
  to focus; the dots close or zoom.

### 3.4 Animations

- `TileWindow` animates `transform` (translate) together with `width` and
  `height`, using terax's `--dur-base` duration and `--ease-premium` easing.
- **Open:** the new window starts as the zero-size edge of the leaf it split
  and grows, while that leaf moves to its new half.
- **Close:** the window shrinks toward its sibling, which grows into the space.
  The element is removed when its transition ends.
- **Swap:** the two windows move to each other's rectangles.
- **Zoom:** the zoomed window grows to the full area while the others fade out;
  un-zooming reverses this.
- **Terminal size:** while a window animates, its terminal keeps its old size,
  clipped by the frame. On `transitionend`, or straight away if animations are
  off, the terminal is fitted once. terax's `PtyResizeScheduler` (256 ms
  debounce) then sends one PTY resize.
- **A change during an animation:** windows go to the new rectangle from where
  they are. The fit happens only after the last transition.
- **Resizing the terax window** re-tiles with transitions off.
- **Off switches:** `prefers-reduced-motion: reduce`, or the Animations setting
  turned off, makes every change instant.

### 3.5 The Ctrl+B layer

`src/modules/tiling/lib/prefix.ts` is a small, pure state machine with the
states `idle`, `armed` and `repeat(action, until)`. A hook,
`useTilingPrefix`, registers it in the same capture-phase `keydown` listener
as `useGlobalShortcuts`.

| Situation | Result |
|---|---|
| Prefix key (default Ctrl+B) in a terminal tab | Arm. Show `Ctrl+B …` in the status bar. Stop the key reaching the terminal. |
| Armed + a key from the table below | Run the action and disarm, or enter `repeat` for a resize key. Stop the key. |
| Armed + prefix key again | Send a literal Ctrl+B (0x02) to the focused terminal through `writeToSession(leafId, "\x02")` (`terminalSessionApi.ts`), then disarm. |
| Armed + Esc, or a key not in the table | Disarm. Send nothing. |
| `repeat` + the same resize key within 600 ms | Resize again and extend the window. |
| `repeat` + anything else | Leave `repeat`, then handle the key as if idle. |
| Not a terminal tab, or `event.isComposing` | The layer does nothing. |

| After the prefix | Action |
|---|---|
| `Enter` | new terminal (BSP) |
| `h` `j` `k` `l`, or the arrows | focus left / down / up / right |
| `H` `J` `K` `L`, or Shift+arrows | swap left / down / up / right |
| `<` `>` | narrower / wider |
| `-` `+` | shorter / taller |
| `z` | toggle zoom |
| `x` | close the pane |
| `?` | show a cheat-sheet of these keys |

Each action is also registered as a terax shortcut ID (`tiling.newTerminal`,
`tiling.focusLeft`, and so on) with no default chord, so it can be bound in
Settings → Shortcuts.

### 3.6 Settings

There is a new "Tiling" section in `src/settings/sections/TilingSection.tsx`.

| Setting | Default |
|---|---|
| Prefix key | Ctrl+B (Ctrl+A is the usual alternative) |
| Gap | 6 px (0–24) |
| Title bars | on |
| Dim unfocused windows | on |
| Animations | on |

### 3.7 Saving with Spaces

- `SerializedNode` split nodes gain an optional `sizes`. `serializeNode` writes
  it when it's present.
- Loading checks it: the length must match the children, every value must be
  finite and greater than 0, and the values are renormalised to sum to 1.
  Anything else is dropped, which gives equal shares.
- Spaces saved by stock terax (no `sizes`) load unchanged.
- `zoomedLeafId` is never saved.

### 3.8 Edge cases and errors

- **Minimum window size:** 120 × 60 px of content. A new terminal or resize that
  would break it is refused with a toast ("Not enough room"), and the tree is
  left unchanged.
- **Empty or too-small tab area** (width or height 0, for example while hidden):
  skip the layout and keep the last rectangles.
- **Invalid `sizes` at runtime:** treated as equal shares, never thrown.
- **Prefix armed when the tab loses focus or changes:** disarm.

## 4. Files

New: `src/modules/tiling/`

- `index.ts`
- `TiledLayout.tsx`
- `TileWindow.tsx`
- `lib/layout.ts` (`layoutRects`, `neighbourInDirection`, `resizeInDirection`)
- `lib/bsp.ts` (`splitLeafBinary`, `spiralDirection`, `removeLeafAndCollapse`)
- `lib/prefix.ts`
- `lib/useTilingPrefix.ts`
- `lib/settings.ts`
- tests next to each file
- `src/settings/sections/TilingSection.tsx`

Changed (each gets a short "modified" header, as Apache 2.0 requires):

- `src/modules/terminal/lib/panes.ts`: the `sizes` field on split nodes
- `src/modules/terminal/PaneTreeView.tsx`: draw through `TiledLayout`
- `src/modules/tabs/lib/useTabs.ts`: `zoomedLeafId`
- `src/modules/spaces/lib/serialize.ts`: save and check `sizes`
- `src/modules/shortcuts/shortcuts.ts`: the `tiling.*` shortcut IDs
- `src/app/App.tsx`: register `useTilingPrefix`
- `src/modules/statusbar/StatusBar.tsx`: the prefix indicator
- `src/settings/SettingsApp.tsx`: add the Tiling section
- `NOTICE` (new): says this is a modified fork of terax

## 5. Testing

Tests are written before the code they cover, using vitest and React Testing
Library, as terax already does.

- **`layout.ts`:** gaps and edges with 1–5 panes; `sizes` respected; neighbours
  share edges after rounding; zoom; neighbour choice with ties and with none;
  resize steps and the minimum-size clamp.
- **`bsp.ts`:** the spiral axis alternates with depth; the first axis follows the
  tab's shape; a binary split happens even when the parent runs the same way;
  close collapses single-child splits and renormalises `sizes`.
- **`prefix.ts`:** arm and disarm; Esc; unknown keys; the double prefix sends
  0x02; the resize repeat window and its expiry; composition ignored; ignored
  outside terminal tabs.
- **`serialize.ts`:** a round trip with `sizes`; old data without `sizes`; invalid
  `sizes` dropped.
- **`TiledLayout`:** one window per leaf, keyed by leaf ID; after a split, the
  existing terminal's element is the same instance (it was not recreated); the
  focused window carries the accent class.
- **Before calling it done:** `pnpm test`, `pnpm check-types`, `pnpm lint`,
  `pnpm format:check` and `pnpm size` all pass.
- **In the built app:** open, close, swap and zoom animations; one PTY resize
  per change (checked with terax's terminal diagnostics); idle and animating
  CPU compared with stock terax.

## 6. Building and delivery

- **Local (~1 GB):** Node and pnpm, plus `pnpm install`. This is enough for all
  of the tests and checks in section 5. No Rust is installed locally.
- **GitHub:** the fork is pushed to the user's GitHub account (only after the
  user agrees). A new `.github/workflows/fork-build.yml` runs on pushes to
  `tuios-tiling` and on demand:
  - on `macos-latest`: `pnpm install` then `pnpm tauri build --bundles app`,
    with a config override that turns off `createUpdaterArtifacts` and the
    updater, and sets the identifier to `app.crynta.terax.tiling` and the
    product name to "Terax Tiling";
  - the app is unsigned, and the zipped `.app` is uploaded as an artifact
    (about 9–10 MB).
- **On the Mac:** `gh run download` into `~/Applications`. Because the app is
  unsigned, the first launch needs right-click → Open, or clearing the
  quarantine flag.
- **Why the override matters:** without it, the fork would share settings and
  data with the installed Terax (same identifier), and the updater could
  replace it with an upstream release.
- **The upstream files stay untouched:** `tauri.conf.json`, `release.yml` and
  `ci.yml` are not edited, which keeps merging upstream changes easy.

## 7. Space

| | Size |
|---|---|
| Source clone | ~36 MB |
| Node, pnpm and `node_modules` while working | ~0.5–1 GB |
| Compiling | on GitHub; 0 locally |
| Finished app | ~10 MB |
| After cleanup (deleting Node and `node_modules`) | ~10 MB, plus the source if kept |
