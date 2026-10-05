/**
 * TOSS Terminal was called Terax (Tiling). Small per-window state lives in
 * localStorage under "terax…" keys; move it to the "toss…" names the code
 * now uses, once, before anything reads it. (The web storage folder itself
 * is copied to the new app identifier by the Rust side, src-tauri migrate.rs.)
 */

type KeyStorage = Pick<
  Storage,
  "key" | "getItem" | "setItem" | "removeItem"
> & {
  readonly length: number;
};

/** Theme ids were "terax-…"; they're "toss-…" now. */
export function legacyThemeId(id: string): string {
  return id.startsWith("terax-") ? `toss-${id.slice("terax-".length)}` : id;
}

export function migrateLegacyKeys(storage: KeyStorage): void {
  try {
    const legacy: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.includes("terax")) legacy.push(key);
    }
    for (const key of legacy) {
      const value = storage.getItem(key);
      const next = key.split("terax").join("toss");
      if (value !== null && storage.getItem(next) === null) {
        storage.setItem(next, legacyThemeId(value));
      }
      storage.removeItem(key);
    }
  } catch {
    // Storage unavailable (private mode, blocked): nothing to carry over.
  }
}
