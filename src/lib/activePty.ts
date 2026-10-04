/**
 * Type text into the active terminal pane, for "run in terminal" buttons
 * (Markdown code blocks). The app registers how; null when it can't.
 */
let injector: ((text: string) => boolean) | null = null;

export function setActivePtyInjector(fn: ((text: string) => boolean) | null): void {
  injector = fn;
}

/** False when there's no terminal pane to type into. */
export function injectIntoActivePty(text: string): boolean {
  return injector?.(text) ?? false;
}
