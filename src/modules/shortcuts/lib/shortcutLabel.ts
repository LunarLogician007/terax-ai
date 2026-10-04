import { usePreferencesStore } from "@/modules/settings/preferences";
import { effectiveBindings } from "../presets";
import { getBindingTokens, type ShortcutId } from "../shortcuts";

/** Display tokens for a shortcut, honoring overrides and the preset. Non-reactive: for
 *  imperative callers (toasts) that can't use the useShortcutLabel hook. */
export function shortcutLabel(id: ShortcutId): string {
  const { shortcuts, shortcutPreset } = usePreferencesStore.getState();
  const bindings = effectiveBindings(id, shortcuts, shortcutPreset);
  return getBindingTokens(bindings?.[0]).join(" ");
}
