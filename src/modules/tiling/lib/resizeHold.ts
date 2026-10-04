/**
 * Holding terminals at their size while windows animate.
 *
 * Terax's newer Ghostty engine can pause refits during a layout change
 * (terminalResizeInteraction), so a pane is fitted once when it settles. The
 * xterm engine this build uses has no such switch: its renderer pool already
 * debounces every fit and every PTY resize, so a 240 ms animation costs at
 * most a fit or two. These are the hooks the tiling calls either way; here
 * they have nothing to hold.
 */
export function beginTerminalResizeInteraction(_token: object): void {}

export function endTerminalResizeInteraction(_token: object): void {}
