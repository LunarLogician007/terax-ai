import { usePreferencesStore } from "@/modules/settings/preferences";
import { useTilingPrefixArmed } from "./lib/useTilingPrefix";

const LABEL = {
  "ctrl+b": "Ctrl+B",
  "ctrl+a": "Ctrl+A",
  "ctrl+space": "Ctrl+Space",
};

/** Shown in the status bar while the tiling prefix waits for its next key. */
export function PrefixIndicator() {
  const armed = useTilingPrefixArmed();
  const prefix = usePreferencesStore((s) => s.tilingPrefix);
  if (!armed) return null;
  return (
    <span className="shrink-0 rounded-sm bg-[var(--accent)]/15 px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--accent)]">
      {LABEL[prefix]} …
    </span>
  );
}
