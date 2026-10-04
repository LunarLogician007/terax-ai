// Modified for Terax Tiling (tuios-style tiling), 2026.
import { invoke } from "@tauri-apps/api/core";

export type SettingsTab =
  | "general"
  | "editor"
  | "themes"
  | "shortcuts"
  | "tiling"
  | "dictation"
  | "about";

export async function openSettingsWindow(tab?: SettingsTab): Promise<void> {
  await invoke("open_settings_window", { tab: tab ?? null });
}
