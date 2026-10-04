import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePreferencesStore } from "@/modules/settings/preferences";

const LABEL = {
  "ctrl+b": "Ctrl+B",
  "ctrl+a": "Ctrl+A",
  "ctrl+space": "Ctrl+Space",
};

const ROWS: Array<[string, string]> = [
  ["Enter", "New terminal (tiles itself)"],
  ["h j k l  /  arrows", "Focus left, down, up, right"],
  ["H J K L  /  Shift+arrows", "Swap with that neighbour"],
  ["<  >", "Narrower, wider"],
  ["-  +", "Shorter, taller"],
  ["z", "Zoom the pane on or off"],
  ["x", "Close the pane"],
  ["?", "This sheet"],
];

/** The Ctrl+B cheat-sheet, opened with the prefix and ?. */
export function TilingHelp({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const prefix = LABEL[usePreferencesStore((s) => s.tilingPrefix)];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Tiling keys</DialogTitle>
          <DialogDescription>
            Press {prefix}, then one of these. {prefix} twice sends {prefix} to
            the shell.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 font-mono text-[12px]">
          {ROWS.map(([keys, what]) => (
            <div key={keys} className="contents">
              <dt className="text-[var(--accent)]">{keys}</dt>
              <dd className="text-muted-foreground">{what}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
