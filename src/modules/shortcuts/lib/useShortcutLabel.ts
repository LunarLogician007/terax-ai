import { usePreferencesStore } from "@/modules/settings/preferences";
import { effectiveBindings } from "../presets";
import { getBindingTokens, type ShortcutId } from "../shortcuts";

/** Display tokens for a shortcut's first binding, honoring overrides and the preset. */
export function useShortcutLabel(id: ShortcutId): string {
  const user = usePreferencesStore((s) => s.shortcuts);
  const preset = usePreferencesStore((s) => s.shortcutPreset);
  const bindings = effectiveBindings(id, user, preset);
  return getBindingTokens(bindings?.[0]).join(" ");
}
