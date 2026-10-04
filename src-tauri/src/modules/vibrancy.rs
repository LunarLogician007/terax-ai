// Modified for Terax Tiling: ported from upstream Terax (main) vibrancy.rs,
// trimmed to macOS. Gives the translucent window its blurred backdrop.
use serde::Serialize;

/// The translucent window backdrop the platform provides.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Backdrop {
    /// macOS `NSVisualEffectView`.
    Vibrancy,
    None,
}

pub fn backdrop_for(os: &str) -> Backdrop {
    match os {
        "macos" => Backdrop::Vibrancy,
        _ => Backdrop::None,
    }
}

#[tauri::command]
pub fn window_backdrop_kind() -> Backdrop {
    backdrop_for(std::env::consts::OS)
}

#[tauri::command]
pub fn window_set_backdrop(window: tauri::Window, enabled: bool) -> Result<(), String> {
    set_backdrop(&window, enabled)
}

#[cfg(target_os = "macos")]
fn set_backdrop(window: &tauri::Window, enabled: bool) -> Result<(), String> {
    use window_vibrancy::{apply_vibrancy, clear_vibrancy, NSVisualEffectMaterial};

    if enabled {
        // UnderWindowBackground is the material meant for a whole-window
        // backdrop; Sidebar/HudWindow are for panels drawn on top of content.
        apply_vibrancy(window, NSVisualEffectMaterial::UnderWindowBackground, None, None)
            .map_err(|e| e.to_string())
    } else {
        clear_vibrancy(window).map(|_| ()).map_err(|e| e.to_string())
    }
}

#[cfg(not(target_os = "macos"))]
fn set_backdrop(_window: &tauri::Window, _enabled: bool) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{backdrop_for, Backdrop};

    #[test]
    fn macos_reports_vibrancy() {
        assert_eq!(backdrop_for("macos"), Backdrop::Vibrancy);
    }

    #[test]
    fn other_platforms_report_none() {
        assert_eq!(backdrop_for("linux"), Backdrop::None);
        assert_eq!(backdrop_for("windows"), Backdrop::None);
    }
}
