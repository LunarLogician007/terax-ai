// The preset names on their own, with no imports: the settings store loads
// this at startup, and must not pull in the shortcut table (and the platform
// module it reads) to do so.

export type PresetId = "custom" | "iterm" | "ghostty";
export const PRESET_IDS: readonly PresetId[] = ["custom", "iterm", "ghostty"];
export const PRESET_LABELS: Record<PresetId, string> = {
  custom: "Custom",
  iterm: "iTerm2",
  ghostty: "Ghostty",
};

export function coercePreset(v: unknown): PresetId {
  return PRESET_IDS.includes(v as PresetId) ? (v as PresetId) : "custom";
}
