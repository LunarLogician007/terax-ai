<div align="center">
  <img src="public/logo.png" width="128" height="128" alt="TOSS Terminal" />
  <h1>TOSS Terminal</h1>
  <p><strong>A lightweight, tiling terminal workspace for macOS.</strong></p>
</div>

---

TOSS Terminal is a fork of [Terax](https://github.com/crynta/terax-ai) by
crynta (Apache-2.0), built on Tauri 2, Rust and React. It keeps Terax's fast
xterm.js terminal, file explorer, Markdown viewer, code editor, web preview
and source control, and adds:

- **tuios-style tiling**: panes place themselves (BSP), with gaps, title bars
  and animations; a `Ctrl+B` prefix drives them (`|` and `-` split, arrows
  move, `z` zoom, `x` close, `?` lists every key).
- **Spaces** for grouping tabs, and an **agents list** in the sidebar that
  tracks Claude Code, Codex and others running in your terminals ("works on a
  turn", "user input needed").
- **A see-through window** with macOS blur, at an opacity you choose.
- **A message line** in the top bar for copies, pastes, closed panes and
  agents needing you.
- **Keybinding presets**: Custom, iTerm2 or Ghostty pane keys.
- **Local dictation**: Whisper (tiny.en, 32 MB, or base.en) runs inside the
  app, typed into the terminal as you speak. Nothing leaves your Mac. Turn it
  on with **mic** in the status bar, then `Ctrl+B Ctrl+Space`.

The built-in AI assistant from Terax is not included.

## Install

Builds come from GitHub Actions (`fork-build`): download the
`toss-terminal-macos` artifact from the latest run, unzip it into
`~/Applications`, and open it. The app is unsigned, so macOS may ask you to
confirm the first launch.

Coming from a "Terax Tiling" build? Your settings, Spaces, themes and speech
model are copied over on first launch.

## Build from source

```sh
pnpm install
pnpm tauri build --bundles app --no-sign
```

Needs Node 24+, pnpm, Rust (stable) and cmake (for whisper.cpp).

## Size

About 10 MB for the app, plus 32 MB for the speech model if you use
dictation.

## License

Apache-2.0, like Terax. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
Original copyright notices are kept; files changed from upstream carry a
"Modified for TOSS Terminal" note.
