//! One-time move from the "Terax Tiling" build to TOSS Terminal. The new
//! bundle identifier means new data folders, so on the first launch the old
//! ones are copied across: settings, Spaces, custom themes, window state,
//! speech models and web storage. The old folders are left as they were.

use std::fs;
use std::io;
use std::path::Path;

/// The identifier the Terax Tiling builds used.
pub const OLD_ID: &str = "app.crynta.terax.tiling";
/// TOSS Terminal's identifier (tauri.conf.json).
pub const NEW_ID: &str = "app.toss.terminal";

/// A top-level file's name in the new folder: the stores were "terax-*.json".
pub fn migrated_name(name: &str) -> String {
    match name.strip_prefix("terax-") {
        Some(rest) => format!("toss-{rest}"),
        None => name.to_string(),
    }
}

/// Copy `old` into `new` if `new` doesn't exist yet. Top-level files are
/// renamed with [`migrated_name`] when `rename` is set; files under
/// `models/` are hard-linked when possible, so a speech model isn't stored
/// twice. The copy goes to a temporary folder that is renamed at the end, so
/// a half-finished copy never counts as done. True when something was copied.
pub fn migrate_dir(old: &Path, new: &Path, rename: bool) -> io::Result<bool> {
    if new.exists() || !old.is_dir() {
        return Ok(false);
    }
    let tmp = new.with_extension("migrating");
    if tmp.exists() {
        fs::remove_dir_all(&tmp)?;
    }
    copy_tree(old, &tmp, rename, false)?;
    fs::rename(&tmp, new)?;
    Ok(true)
}

fn copy_tree(from: &Path, to: &Path, rename: bool, link: bool) -> io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let target = to.join(if rename { migrated_name(&name) } else { name.clone() });
        let kind = entry.file_type()?;
        if kind.is_dir() {
            copy_tree(&entry.path(), &target, false, link || name == "models")?;
        } else if kind.is_file() {
            // Hard links share the file, which is right for read-only models
            // but not for settings the new app will rewrite.
            if !(link && fs::hard_link(entry.path(), &target).is_ok()) {
                fs::copy(entry.path(), &target)?;
            }
        }
        // Symlinks and other special files are skipped.
    }
    Ok(())
}

/// Run the migration for this user, before anything reads the new folders.
pub fn run_once() {
    #[cfg(target_os = "macos")]
    {
        let Some(home) = dirs::home_dir() else {
            return;
        };
        let library = home.join("Library");
        for (base, rename) in [
            (library.join("Application Support"), true),
            (library.join("WebKit"), false),
        ] {
            let (old, new) = (base.join(OLD_ID), base.join(NEW_ID));
            match migrate_dir(&old, &new, rename) {
                Ok(true) => eprintln!("toss: copied {} to {}", old.display(), new.display()),
                Ok(false) => {}
                Err(e) => eprintln!("toss: couldn't copy {}: {e}", old.display()),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(path: &Path, text: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    #[test]
    fn store_files_get_toss_names_and_others_keep_theirs() {
        assert_eq!(migrated_name("terax-settings.json"), "toss-settings.json");
        assert_eq!(migrated_name("terax-spaces.json"), "toss-spaces.json");
        assert_eq!(migrated_name(".window-state.json"), ".window-state.json");
        assert_eq!(migrated_name("models"), "models");
    }

    #[test]
    fn copies_everything_across_with_new_names() {
        let root = tempfile::tempdir().unwrap();
        let (old, new) = (root.path().join("old"), root.path().join("new"));
        write(&old.join("terax-settings.json"), r#"{"themeId":"x"}"#);
        write(&old.join(".window-state.json"), "{}");
        write(&old.join("models/ggml-tiny.en-q5_1.bin"), "weights");
        write(&old.join("deep/terax-keep.txt"), "nested names stay");

        assert!(migrate_dir(&old, &new, true).unwrap());
        assert_eq!(fs::read_to_string(new.join("toss-settings.json")).unwrap(), r#"{"themeId":"x"}"#);
        assert!(new.join(".window-state.json").is_file());
        assert_eq!(fs::read_to_string(new.join("models/ggml-tiny.en-q5_1.bin")).unwrap(), "weights");
        assert!(new.join("deep/terax-keep.txt").is_file());
        // The old folder is untouched.
        assert!(old.join("terax-settings.json").is_file());
        assert!(!root.path().join("new.migrating").exists());
    }

    #[test]
    fn settings_are_copies_not_links() {
        let root = tempfile::tempdir().unwrap();
        let (old, new) = (root.path().join("old"), root.path().join("new"));
        write(&old.join("terax-settings.json"), "old");
        migrate_dir(&old, &new, true).unwrap();
        fs::write(new.join("toss-settings.json"), "new").unwrap();
        assert_eq!(fs::read_to_string(old.join("terax-settings.json")).unwrap(), "old");
    }

    #[test]
    fn runs_once_and_only_when_there_is_something_to_copy() {
        let root = tempfile::tempdir().unwrap();
        let (old, new) = (root.path().join("old"), root.path().join("new"));
        assert!(!migrate_dir(&old, &new, true).unwrap()); // nothing to copy
        write(&old.join("terax-settings.json"), "{}");
        assert!(migrate_dir(&old, &new, true).unwrap());
        write(&old.join("terax-spaces.json"), "{}");
        assert!(!migrate_dir(&old, &new, true).unwrap()); // already done
        assert!(!new.join("toss-spaces.json").exists());
    }

    #[test]
    fn a_leftover_half_copy_is_replaced() {
        let root = tempfile::tempdir().unwrap();
        let (old, new) = (root.path().join("old"), root.path().join("new"));
        write(&old.join("terax-settings.json"), "{}");
        write(&root.path().join("new.migrating/junk"), "half");
        assert!(migrate_dir(&old, &new, true).unwrap());
        assert!(!new.join("junk").exists());
        assert!(new.join("toss-settings.json").is_file());
    }
}
