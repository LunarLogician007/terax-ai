# Terax Tiling, project 2: see-through window and terminal-style sidebar

Date: 2026-10-04 · Branch: `tuios-tiling-v086` · Status: approved in conversation

## Window
- `tauri.conf.json`: main window `transparent`, `app.macOSPrivateApi`.
- Cargo: tauri feature `macos-private-api`; `window-vibrancy = "0.8"` (macOS).
- `src-tauri/src/modules/vibrancy.rs`: upstream Terax's module trimmed to macOS
  (`window_backdrop_kind`, `window_set_backdrop` → NSVisualEffectMaterial
  UnderWindowBackground). Not App-Store compatible (private API).

## See-through everywhere, without stacking
Stacked translucent layers multiply, so one layer carries the opacity:
- page root background = theme background at the chosen opacity (inline);
- `--background` → transparent; `--card`, `--sidebar` → 25 % tint;
  popovers untouched (menus stay readable); body transparent;
- terminal: xterm `allowTransparency` with a clear background.
Re-applied after every theme write (`applyTheme` → `reapplyTranslucency`).
Editor tabs keep their CodeMirror theme background.

## Settings → Themes → Window
Translucent window (default on), Opacity 40–100 % (default 85 %).

## Sidebar (light touch)
Files and Git text in JetBrains Mono; icons and controls unchanged.

## Tests
`withAlpha`, `translucentOverrides`, `clampWindowOpacity`; Rust unit tests for
`backdrop_for`. Visual check in the built app.
