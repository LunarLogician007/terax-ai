import type { PresetId } from "./presetIds";
import { type KeyBinding, SHORTCUTS, type ShortcutId } from "./shortcuts";

export {
  coercePreset,
  PRESET_IDS,
  PRESET_LABELS,
  type PresetId,
} from "./presetIds";

/**
 * Keybinding presets (Terax Tiling). Custom is Terax's own defaults; iTerm2
 * and Ghostty remap the pane keys (focus, resize, zoom) to those apps'
 * macOS defaults. The
 * Ctrl+B tiling prefix works in every preset. Your own bindings from
 * Settings → Shortcuts always win over the preset.
 */
type Overrides = Partial<Record<ShortcutId, KeyBinding[]>>;

// iTerm2 and Ghostty are macOS apps, so their keys name Cmd outright. "Mod"
// would be Ctrl elsewhere and turn Cmd+Ctrl+↑ into a plain Ctrl+↑ that Terax
// already uses for block navigation.
const mod = (key: string, extra: Omit<KeyBinding, "key"> = {}): KeyBinding => ({
  meta: true,
  ...extra,
  key,
});

/** What iTerm2 and Ghostty share: split focus, resize, zoom. */
const MAC_TERMINAL: Overrides = {
  "tiling.focusLeft": [mod("ArrowLeft", { alt: true })],
  "tiling.focusRight": [mod("ArrowRight", { alt: true })],
  "tiling.focusUp": [mod("ArrowUp", { alt: true })],
  "tiling.focusDown": [mod("ArrowDown", { alt: true })],
  // Cmd+Opt+arrows is focus there, so swapping takes Shift as well.
  "pane.swapLeft": [mod("ArrowLeft", { alt: true, shift: true })],
  "pane.swapRight": [mod("ArrowRight", { alt: true, shift: true })],
  "pane.swapUp": [mod("ArrowUp", { alt: true, shift: true })],
  "pane.swapDown": [mod("ArrowDown", { alt: true, shift: true })],
  "tiling.grow": [mod("ArrowRight", { ctrl: true })],
  "tiling.shrink": [mod("ArrowLeft", { ctrl: true })],
  "tiling.taller": [mod("ArrowDown", { ctrl: true })],
  "tiling.shorter": [mod("ArrowUp", { ctrl: true })],
  "tiling.zoom": [mod("Enter", { shift: true })],
  // Tab cycling is left alone: iTerm2 and Ghostty also take Ctrl+Tab, which
  // is Terax's default, and Cmd+Shift+] / [ already switch Terax Spaces.
};

const PRESETS: Record<PresetId, Overrides> = {
  custom: {},
  iterm: MAC_TERMINAL,
  ghostty: {
    ...MAC_TERMINAL,
    "tiling.equalize": [mod("=", { ctrl: true })],
  },
};

const BY_ID = new Map(SHORTCUTS.map((s) => [s.id, s]));

/** The keys an action answers to: your binding, else the preset's, else Terax's. */
export function effectiveBindings(
  id: ShortcutId,
  user: Partial<Record<ShortcutId, KeyBinding[]>>,
  preset: PresetId,
): KeyBinding[] {
  return (
    user[id] ?? PRESETS[preset][id] ?? BY_ID.get(id)?.defaultBindings ?? []
  );
}
