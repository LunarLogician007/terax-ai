import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { Rect } from "./lib/layout";

type Props = {
  rect: Rect;
  /** Start here and animate to `rect` once mounted; null starts at `rect`. */
  from: Rect | null;
  animate: boolean;
  hidden: boolean;
  focused: boolean;
  ghost: boolean;
  titleBar: boolean;
  dim: boolean;
  title: string;
  badge: ReactNode;
  onClose?: () => void;
  onZoom?: () => void;
  children?: ReactNode;
};

const TRANSITION =
  "left var(--dur-base) var(--ease-premium), top var(--dur-base) var(--ease-premium), width var(--dur-base) var(--ease-premium), height var(--dur-base) var(--ease-premium), opacity var(--dur-base) var(--ease-premium)";

/**
 * One pane drawn as a tuios-style window: rounded frame, a thin title bar
 * with close and zoom dots, and the accent colour when focused.
 */
export function TileWindow(props: Props) {
  const { rect, from, animate, hidden, focused, ghost, titleBar, dim } = props;
  // Two frames at `from` before moving to `rect`, so the browser has a
  // starting point to transition from.
  // The starting rect is fixed at mount: a re-render before the first paint
  // must not skip the entry.
  const start = useRef(from).current;
  const [entered, setEntered] = useState(start === null);
  useEffect(() => {
    if (entered) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [entered]);

  const at = entered || !start ? rect : start;
  return (
    <div
      className={cn(
        "absolute flex flex-col overflow-hidden rounded-[var(--radius-lg)] border bg-background",
        focused ? "border-[var(--primary)]" : "border-border",
        (hidden || ghost) && "pointer-events-none",
      )}
      style={{
        left: at.x,
        top: at.y,
        width: at.width,
        height: at.height,
        opacity: hidden ? 0 : 1,
        transition: animate ? TRANSITION : "none",
      }}
      data-tile-focused={focused || undefined}
    >
      {titleBar && (
        <div
          className={cn(
            "flex h-6 shrink-0 select-none items-center gap-2 border-b px-2 text-[11px]",
            focused
              ? "border-[var(--primary)]/40 text-[var(--primary)]"
              : "border-border text-muted-foreground",
          )}
        >
          <span className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Close pane"
              onClick={props.onClose}
              className="size-2.5 rounded-full bg-red-500/80 hover:bg-red-500"
            />
            <button
              type="button"
              aria-label="Zoom pane"
              onClick={props.onZoom}
              className="size-2.5 rounded-full bg-emerald-500/80 hover:bg-emerald-500"
            />
          </span>
          <span className="min-w-0 flex-1 truncate font-mono">
            {props.title}
          </span>
          {props.badge}
        </div>
      )}
      <div
        className="relative min-h-0 flex-1"
        style={{
          opacity: dim && !focused && !ghost ? 0.85 : 1,
          transition: animate ? "opacity var(--dur-base)" : "none",
        }}
      >
        {props.children}
      </div>
    </div>
  );
}
