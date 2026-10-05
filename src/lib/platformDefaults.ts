/**
 * TOSS Terminal: the see-through window looks right over macOS's blur. Linux
 * and Windows have nothing blurring what's behind the window, so text would
 * sit on a sharp desktop; start opaque there (it can still be turned on).
 */
export function translucentByDefault(platform: string): boolean {
  return /mac/i.test(platform);
}
