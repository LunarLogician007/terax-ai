import { useEffect, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  type Message,
  type MessageKind,
  useMessageStore,
  visibleMessage,
} from "./lib/messages";

const INK: Record<MessageKind, string> = {
  info: "bg-sky-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
};
const TEXT_INK: Record<MessageKind, string> = {
  info: "text-sky-500",
  success: "text-emerald-500",
  warning: "text-amber-500",
  error: "text-red-500",
};
// tuios's cap weight: the more it matters, the heavier the sliver.
const CAP: Record<MessageKind, string> = {
  info: "w-0.5",
  success: "w-0.5",
  warning: "w-1",
  error: "w-1.5",
};

type Props = { onJump: (tabId: number, leafId: number) => void };

/**
 * The top bar's message line (after tuios's dock messages): what just
 * happened, at the right of the header, never over a pane. A hairline above it
 * burns down as it ages; errors stay until clicked.
 */
export function MessageLine({ onJump }: Props) {
  const history = useMessageStore((s) => s.history);
  const dismiss = useMessageStore((s) => s.dismiss);
  const [now, setNow] = useState(() => Date.now());
  const shown = visibleMessage({ history }, now);

  // Re-render when the newest message arrives and again when it expires.
  const newest = history[0];
  useEffect(() => {
    setNow(Date.now());
    if (!newest || newest.duration === null) return;
    const left = newest.at + newest.duration - Date.now();
    if (left <= 0) return;
    const t = window.setTimeout(() => setNow(Date.now()), left + 20);
    return () => window.clearTimeout(t);
  }, [newest]);

  if (!shown) return null;
  const more = history.length > 1 || shown.text.length > 70;

  return (
    <div className="relative flex min-w-0 max-w-[60%] items-center gap-1.5 pt-0.5 font-mono text-[11.5px]">
      {shown.duration !== null ? (
        <span
          key={shown.id}
          aria-hidden
          className={cn(
            "absolute left-0 right-0 top-0 h-px origin-left",
            INK[shown.kind],
          )}
          style={{
            animation: `toss-msg-burn ${shown.duration}ms linear forwards`,
          }}
        />
      ) : (
        <span
          aria-hidden
          className={cn("absolute left-0 right-0 top-0 h-px", INK[shown.kind])}
        />
      )}
      <span
        aria-hidden
        className={cn(
          "h-4 shrink-0 rounded-full",
          CAP[shown.kind],
          INK[shown.kind],
        )}
      />
      <span aria-hidden className={cn("shrink-0", TEXT_INK[shown.kind])}>
        ●
      </span>
      <button
        type="button"
        onClick={() => {
          if (shown.target) onJump(shown.target.tabId, shown.target.leafId);
          dismiss(shown.id);
        }}
        className={cn(
          "min-w-0 truncate text-left text-foreground/90 hover:text-foreground",
          shown.target &&
            "underline decoration-muted-foreground/60 underline-offset-2",
        )}
        title={shown.text}
      >
        {shown.text}
      </button>
      {more && <MoreList history={history} onJump={onJump} />}
    </div>
  );
}

function MoreList({
  history,
  onJump,
}: {
  history: Message[];
  onJump: (tabId: number, leafId: number) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="shrink-0 px-1 text-muted-foreground hover:text-foreground"
        >
          more
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[28rem] p-2 font-mono text-[11.5px]"
      >
        <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {history.slice(0, 12).map((m) => (
            <li key={m.id} className="flex items-start gap-1.5">
              <span className={cn("shrink-0", TEXT_INK[m.kind])}>●</span>
              <button
                type="button"
                disabled={!m.target}
                onClick={() =>
                  m.target && onJump(m.target.tabId, m.target.leafId)
                }
                className="min-w-0 break-words text-left text-foreground/90 enabled:hover:underline"
              >
                {m.text}
              </button>
              <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                {new Date(m.at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
