# Local dictation — plan

Spec: `docs/superpowers/specs/2026-10-05-local-dictation-design.md`.

No Rust toolchain on the dev Mac (about 3 GB it doesn't have room for), so
Rust tests run in CI (`cargo test --lib stt` in `fork-build.yml`); the
frontend's are run locally with vitest as usual.

1. **Rust `stt` module** (`src-tauri/src/modules/stt.rs`): model table
   (tiny.en, base.en, sizes and SHA-256), path, verify (size + hash),
   download (streamed, hashed as it goes, `.part` then rename, progress
   events), remove, transcribe (raw f32 bytes over binary IPC, padded to
   1.1 s, CPU, English), idle unload after 5 minutes. Unit tests: table,
   verify accepts/rejects, bytes → samples, padding. Deps: `whisper-rs 0.16`
   (no features), `sha2 0.10`. `.cargo/config.toml` sets
   `WHISPER_DONT_GENERATE_BINDINGS=1` (no libclang needed). CI runs the
   module's tests.
2. **Sticky messages:** `MessageInput.sticky` keeps an info message up until
   replaced.
3. **Dictation logic** (`src/modules/dictation/lib/`): transcript cleanup and
   message wording; a controller (toggle, cancel, 2-minute stop, missing
   model → download → ready) with injected recorder, transcriber, model
   store, paste and post, tested with fakes.
4. **Web side:** recorder and 16 kHz resample (`audio.ts`), built-in model
   calls (`builtin.ts`).
5. **Keys:** prefix then Ctrl+Space / Space / v → `dictate`; Esc cancels while
   listening. App wires `dictate` to the controller and pastes into the
   starting pane.
6. **AI chat + Settings:** `SttProvider` `"builtin"`; preference
   `sttBuiltinModel` (`tiny.en` default); Settings → Models: provider option,
   model choice, status, Download / Remove.
7. Checks (types, lint 103, all tests, frontend build), commit, push, CI,
   measure the app size, hand over.
