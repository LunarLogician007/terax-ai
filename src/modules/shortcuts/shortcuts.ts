// Modified for TOSS Terminal (tuios-style tiling), 2026.
import { IS_MAC, MOD_PROP } from "@/lib/platform";

/**
 * Single source of truth for keyboard shortcuts.
 */

export type ShortcutId =
  | "commandPalette.open"
  | "commandPalette.content"
  | "tab.new"
  | "tab.newBlock"
  | "tab.newPrivate"
  | "tab.newPreview"
  | "tab.newEditor"
  | "tab.close"
  | "tab.next"
  | "tab.prev"
  | "tab.selectByIndex"
  | "space.next"
  | "space.prev"
  | "space.overview"
  | "pane.splitRight"
  | "pane.splitDown"
  | "pane.focusNext"
  | "pane.focusPrev"
  | "pane.swapLeft"
  | "pane.swapRight"
  | "pane.swapUp"
  | "pane.swapDown"
  | "pane.source"
  | "tiling.newTerminal"
  | "tiling.focusLeft"
  | "tiling.focusDown"
  | "tiling.focusUp"
  | "tiling.focusRight"
  | "tiling.swapLeft"
  | "tiling.swapDown"
  | "tiling.swapUp"
  | "tiling.swapRight"
  | "tiling.grow"
  | "tiling.shrink"
  | "tiling.taller"
  | "tiling.shorter"
  | "tiling.zoom"
  | "tiling.equalize"
  | "tiling.close"
  | "terminal.clear"
  | "blocks.prev"
  | "blocks.next"
  | "search.focus"
  | "explorer.search"
  | "explorer.focus"
  | "view.zoomIn"
  | "view.zoomOut"
  | "view.zoomReset"
  | "view.zenMode"
  | "agent.focusAttention"
  | "settings.open"
  | "sidebar.toggle"
  | "editor.undo"
  | "editor.redo"
  | "editor.codeComplete";

export type ShortcutGroup =
  | "General"
  | "Tabs"
  | "Spaces"
  | "Panes"
  | "Tiling"
  | "Terminal"
  | "Search"
  | "Agents"
  | "View"
  | "Editor";

export type KeyBinding = {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
};

export type Shortcut = {
  id: ShortcutId;
  label: string;
  group: ShortcutGroup;
  defaultBindings: KeyBinding[];
  allowRepeat?: boolean;
};

export const SHORTCUTS: Shortcut[] = [
  {
    id: "commandPalette.open",
    label: "Open command palette",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, key: "p" }],
  },
  {
    id: "commandPalette.content",
    label: "Find in files",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "p" }],
  },
  {
    id: "settings.open",
    label: "Open settings",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, key: "," }],
  },
  {
    id: "tab.new",
    label: "New tab",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, key: "t" }],
  },
  {
    id: "tab.newBlock",
    label: "New Blocks terminal",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "t" }],
  },
  {
    id: "tab.newPrivate",
    label: "New private terminal",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, key: "r" }],
  },
  {
    id: "tab.newPreview",
    label: "New web preview",
    group: "Tabs",
    // Cmd/Ctrl+P now opens the command palette, so web preview moves here.
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "o" }],
  },
  {
    id: "tab.newEditor",
    label: "New editor tab",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, key: "e" }],
  },
  {
    id: "tab.close",
    label: "Close tab or pane",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, key: "w" }],
  },
  {
    id: "pane.splitRight",
    label: "Split pane right",
    group: "Panes",
    defaultBindings: [{ [MOD_PROP]: true, key: "d" }],
  },
  {
    id: "pane.splitDown",
    label: "Split pane down",
    group: "Panes",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "d" }],
  },
  {
    id: "pane.focusNext",
    label: "Focus next pane",
    group: "Panes",
    defaultBindings: [{ [MOD_PROP]: true, key: "]" }],
  },
  {
    id: "pane.focusPrev",
    label: "Focus previous pane",
    group: "Panes",
    defaultBindings: [{ [MOD_PROP]: true, key: "[" }],
  },
  {
    id: "pane.swapLeft",
    label: "Swap pane left",
    group: "Panes",
    defaultBindings: [{ [MOD_PROP]: true, alt: true, key: "ArrowLeft" }],
  },
  {
    id: "pane.swapRight",
    label: "Swap pane right",
    group: "Panes",
    defaultBindings: [{ [MOD_PROP]: true, alt: true, key: "ArrowRight" }],
  },
  {
    id: "pane.swapUp",
    label: "Swap pane up",
    group: "Panes",
    defaultBindings: [{ [MOD_PROP]: true, alt: true, key: "ArrowUp" }],
  },
  {
    id: "pane.swapDown",
    label: "Swap pane down",
    group: "Panes",
    defaultBindings: [{ [MOD_PROP]: true, alt: true, key: "ArrowDown" }],
  },
  {
    id: "pane.source",
    label: "Toggle source panel",
    group: "Panes",
    defaultBindings: [{ [MOD_PROP]: true, key: "g" }],
  },
  {
    id: "tiling.newTerminal",
    label: "New terminal (tiled)",
    group: "Tiling",
    // Reached through the Ctrl+B prefix; bind a chord here if you want one.
    defaultBindings: [],
  },
  {
    id: "tiling.focusLeft",
    label: "Focus pane left",
    group: "Tiling",
    // Reached through the Ctrl+B prefix; bind a chord here if you want one.
    defaultBindings: [],
  },
  {
    id: "tiling.focusDown",
    label: "Focus pane below",
    group: "Tiling",
    // Reached through the Ctrl+B prefix; bind a chord here if you want one.
    defaultBindings: [],
  },
  {
    id: "tiling.focusUp",
    label: "Focus pane above",
    group: "Tiling",
    // Reached through the Ctrl+B prefix; bind a chord here if you want one.
    defaultBindings: [],
  },
  {
    id: "tiling.focusRight",
    label: "Focus pane right",
    group: "Tiling",
    // Reached through the Ctrl+B prefix; bind a chord here if you want one.
    defaultBindings: [],
  },
  {
    id: "tiling.swapLeft",
    label: "Swap with pane left",
    group: "Tiling",
    // Reached through the Ctrl+B prefix; bind a chord here if you want one.
    defaultBindings: [],
  },
  {
    id: "tiling.swapDown",
    label: "Swap with pane below",
    group: "Tiling",
    // Reached through the Ctrl+B prefix; bind a chord here if you want one.
    defaultBindings: [],
  },
  {
    id: "tiling.swapUp",
    label: "Swap with pane above",
    group: "Tiling",
    // Reached through the Ctrl+B prefix; bind a chord here if you want one.
    defaultBindings: [],
  },
  {
    id: "tiling.swapRight",
    label: "Swap with pane right",
    group: "Tiling",
    // Reached through the Ctrl+B prefix; bind a chord here if you want one.
    defaultBindings: [],
  },
  {
    id: "tiling.grow",
    label: "Widen pane",
    group: "Tiling",
    // Reached through the Ctrl+B prefix; bind a chord here if you want one.
    defaultBindings: [],
  },
  {
    id: "tiling.shrink",
    label: "Narrow pane",
    group: "Tiling",
    // Reached through the Ctrl+B prefix; bind a chord here if you want one.
    defaultBindings: [],
  },
  {
    id: "tiling.taller",
    label: "Make pane taller",
    group: "Tiling",
    // Reached through the Ctrl+B prefix; bind a chord here if you want one.
    defaultBindings: [],
  },
  {
    id: "tiling.shorter",
    label: "Make pane shorter",
    group: "Tiling",
    // Reached through the Ctrl+B prefix; bind a chord here if you want one.
    defaultBindings: [],
  },
  {
    id: "tiling.zoom",
    label: "Zoom pane",
    group: "Tiling",
    // Reached through the Ctrl+B prefix; bind a chord here if you want one.
    defaultBindings: [],
  },
  {
    id: "tiling.equalize",
    label: "Equalize splits",
    group: "Tiling",
    // Reached through the Ctrl+B prefix; bind a chord here if you want one.
    defaultBindings: [],
  },
  {
    id: "tiling.close",
    label: "Close pane",
    group: "Tiling",
    // Reached through the Ctrl+B prefix; bind a chord here if you want one.
    defaultBindings: [],
  },
  {
    id: "terminal.clear",
    label: "Clear terminal",
    group: "Terminal",
    // macOS Terminal's ⌘K (clear scrollback, keep the prompt). Default only on
    // macOS — on other platforms Ctrl+K is readline's kill-line, so we leave it
    // unbound and let users assign their own in settings.
    defaultBindings: IS_MAC ? [{ meta: true, key: "k" }] : [],
  },
  {
    id: "blocks.prev",
    label: "Previous command block",
    group: "Terminal",
    defaultBindings: [{ [MOD_PROP]: true, key: "ArrowUp" }],
    allowRepeat: true,
  },
  {
    id: "blocks.next",
    label: "Next command block",
    group: "Terminal",
    defaultBindings: [{ [MOD_PROP]: true, key: "ArrowDown" }],
    allowRepeat: true,
  },
  {
    id: "tab.next",
    label: "Next tab",
    group: "Tabs",
    defaultBindings: [{ ctrl: true, key: "Tab" }],
    allowRepeat: true,
  },
  {
    id: "tab.prev",
    label: "Previous tab",
    group: "Tabs",
    defaultBindings: [{ ctrl: true, shift: true, key: "Tab" }],
    allowRepeat: true,
  },
  {
    id: "tab.selectByIndex",
    label: "Jump to tab 1–9",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, key: "1" }],
  },
  {
    id: "space.next",
    label: "Next space",
    group: "Spaces",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "]" }],
  },
  {
    id: "space.prev",
    label: "Previous space",
    group: "Spaces",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "[" }],
  },
  {
    id: "space.overview",
    label: "Open spaces",
    group: "Spaces",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "s" }],
  },
  {
    id: "explorer.search",
    label: "Search files",
    group: "Search",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "f" }],
  },
  {
    id: "search.focus",
    label: "Find in tab",
    group: "Search",
    defaultBindings: [{ [MOD_PROP]: true, key: "f" }],
  },
  {
    id: "agent.focusAttention",
    label: "Jump to agent needing attention",
    group: "Agents",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "a" }],
  },
  {
    id: "sidebar.toggle",
    label: "Toggle file explorer",
    group: "View",
    // Plain Mod+B toggles the sidebar everywhere EXCEPT a focused terminal,
    // where it's handed to the shell / Claude Code (its "run in background"
    // key). Mod+Shift+B always toggles, including from inside a terminal.
    defaultBindings: [
      { [MOD_PROP]: true, key: "b" },
      { [MOD_PROP]: true, shift: true, key: "b" },
    ],
  },
  {
    id: "explorer.focus",
    label: "Toggle file explorer focus",
    group: "View",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "e" }],
  },
  {
    id: "view.zoomIn",
    label: "Zoom in",
    group: "View",
    defaultBindings: [
      { [MOD_PROP]: true, key: "=" },
      { [MOD_PROP]: true, shift: true, key: "+" },
    ],
    allowRepeat: true,
  },
  {
    id: "view.zoomOut",
    label: "Zoom out",
    group: "View",
    defaultBindings: [
      { [MOD_PROP]: true, key: "-" },
      { [MOD_PROP]: true, shift: true, key: "_" },
    ],
    allowRepeat: true,
  },
  {
    id: "view.zoomReset",
    label: "Reset zoom",
    group: "View",
    defaultBindings: [{ [MOD_PROP]: true, key: "0" }],
  },
  {
    id: "view.zenMode",
    label: "Toggle zen mode",
    group: "View",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "'" }],
  },
  // Editor entries are display-only: CodeMirror's historyKeymap binds these
  // keys natively. We register them here so the shortcuts dialog can surface
  // them — they don't have App-level handlers, so `useGlobalShortcuts` falls
  // through without `preventDefault`, leaving CodeMirror to handle the event.
  // Also excluded from the customization UI in ShortcutsSection.
  {
    id: "editor.undo",
    label: "Undo",
    group: "Editor",
    defaultBindings: [{ [MOD_PROP]: true, key: "z" }],
  },
  {
    id: "editor.redo",
    label: "Redo",
    group: "Editor",
    defaultBindings: [{ [MOD_PROP]: true, key: "y" }],
  },
  {
    id: "editor.codeComplete",
    label: "Trigger code completion",
    group: "Editor",
    defaultBindings: [{ ctrl: true, key: " " }],
  },
];

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  "General",
  "Tabs",
  "Panes",
  "Tiling",
  "Terminal",
  "View",
  "Search",
  "Agents",
  "Editor",
];

/**
 * Matching logic: checks if a KeyboardEvent matches a KeyBinding.
 */
const CODE_TO_KEY: Record<string, string> = {
  Backslash: "\\",
  Slash: "/",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  Space: " ",
};

// macOS Option combinations rewrite e.key ("«", "…", dead keys); the
// physical key survives in e.code.
function keyFromCode(code: string): string | null {
  if (code.startsWith("Key")) return code.slice(3).toLowerCase();
  if (code.startsWith("Digit")) return code.slice(5);
  return CODE_TO_KEY[code] ?? null;
}

export function matchBinding(
  e: KeyboardEvent,
  binding: KeyBinding,
  id?: ShortcutId
): boolean {
  const eventKey = e.key.toLowerCase();
  const bindingKey = binding.key.toLowerCase();

  // Special case for Jump to Tab 1-9
  if (id === "tab.selectByIndex") {
    if (!/^[1-9]$/.test(e.key)) return false;
  } else if (eventKey !== bindingKey) {
    if (!binding.alt || keyFromCode(e.code) !== bindingKey) return false;
  }

  return (
    !!e.ctrlKey === !!binding.ctrl &&
    !!e.shiftKey === !!binding.shift &&
    !!e.altKey === !!binding.alt &&
    !!e.metaKey === !!binding.meta
  );
}

/**
 * Display helpers
 */
export function getBindingTokens(binding?: KeyBinding): string[] {
  if (!binding) return [];
  const tokens: string[] = [];
  if (IS_MAC) {
    if (binding.ctrl) tokens.push("⌃");
    if (binding.alt) tokens.push("⌥");
    if (binding.shift) tokens.push("⇧");
    if (binding.meta) tokens.push("⌘");
  } else {
    if (binding.ctrl) tokens.push("Ctrl");
    if (binding.alt) tokens.push("Alt");
    if (binding.shift) tokens.push("Shift");
    if (binding.meta) tokens.push("Win");
  }

  let keyLabel = binding.key;
  if (keyLabel === " ") keyLabel = "Space";
  else if (keyLabel === "ArrowUp") keyLabel = "↑";
  else if (keyLabel === "ArrowDown") keyLabel = "↓";
  else if (keyLabel === "ArrowLeft") keyLabel = "←";
  else if (keyLabel === "ArrowRight") keyLabel = "→";
  else if (keyLabel.length === 1) keyLabel = keyLabel.toUpperCase();

  tokens.push(keyLabel);
  return tokens;
}
