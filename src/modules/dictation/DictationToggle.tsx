import { cn } from "@/lib/utils";
import { dictation, useDictationSwitch } from "./useDictation";

/**
 * The status bar's dictation switch, for this session (off at every start).
 * On loads the speech model into memory; off frees it.
 */
export function DictationToggle() {
  const { on, busy } = useDictationSwitch();
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void dictation.setEnabled(!on)}
      title={
        on
          ? "Dictation is on (model in memory). Click to turn off and free it."
          : "Dictation is off. Click to load the speech model for this session."
      }
      className={cn(
        "flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] transition-colors",
        on
          ? "text-[var(--sidebar-primary)]"
          : "text-muted-foreground hover:text-foreground",
        busy && "opacity-60",
      )}
    >
      <span aria-hidden>{on ? "●" : "○"}</span>
      {busy ? "mic …" : on ? "mic on" : "mic off"}
    </button>
  );
}
