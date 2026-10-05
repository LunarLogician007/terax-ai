// Imported first by each window's entry point, so the rename's storage
// migration runs before any module reads localStorage.
import { migrateLegacyKeys } from "./legacyStorage";

try {
  if (typeof window !== "undefined") migrateLegacyKeys(window.localStorage);
} catch {
  // localStorage itself can be unreachable; nothing to migrate then.
}
