# Local dictation — design

Terax Tiling, branch `tuios-tiling-v086`. 2026-10-05.

## What it is

Speak into the terminal, like Wispr Flow, with nothing leaving the Mac.
Press **Ctrl+B, then Ctrl+Space**, talk, press it again: the words are typed
into the focused pane, not run. A local Whisper model does the work.

Agreed with the user:

- Model: **Whisper base.en**, run by whisper.cpp inside Terax. Everything is
  open source (Whisper, whisper.cpp and the model file are MIT; the Rust
  binding, whisper-rs, is Unlicense).
- Size: at most 50–80 MB. The model is **60 MB** (`ggml-base.en-q5_1.bin`),
  downloaded once on first use; the app grows by the compiled engine only.
- Trigger: **Ctrl+B, then Ctrl+Space** to start, the same to stop.

## What Terax already has

The AI chat box has a mic button (`useWhisperRecording.ts`, `stt.ts`). It
records in the webview with `MediaRecorder` and sends the audio to one of
three providers: OpenAI or Groq (cloud), or "Whisper.cpp", a server the user
must install and run on localhost. `Info.plist` already carries
`NSMicrophoneUsageDescription`.

So the microphone side exists. What's missing is a built-in local model, and
dictation into the terminal.

## Design

### 1. Built-in transcription (Rust)

New module `src-tauri/src/modules/stt.rs`, using the `whisper-rs` crate
(0.16, `metal` feature on macOS).

- `stt_model_status() -> { ready: bool, bytes: u64 }`: whether the model file
  is present and complete.
- `stt_download_model()`: streams the file from Hugging Face
  (`ggerganov/whisper.cpp`, `ggml-base.en-q5_1.bin`) to a temporary file in
  the app's data folder, emits `stt://download` progress events
  (`{ received, total }`), checks the SHA-256 against the pinned value
  `4baf70dd0d7c4247ba2b81fafd9c01005ac77c2f9ef064e00dcf195d0e2fdd2f`
  (59,721,011 bytes), and only then renames it into place. A wrong checksum
  deletes the file and fails.
- `stt_remove_model()`: deletes it (Settings button).
- `stt_transcribe(samples: Vec<f32>) -> String`: 16 kHz mono samples in,
  text out. Runs on a blocking thread. The model is loaded on first use and
  kept; language English; no timestamps; blank and non-speech tokens
  suppressed.

The download is the only network use, and it fetches the model, never audio.

### 2. Audio to samples (frontend)

The existing recorder gives a compressed blob. A new helper decodes it with
Web Audio and resamples it to 16 kHz mono with an `OfflineAudioContext`,
giving the `Float32Array` that `stt_transcribe` takes.

### 3. A "Built-in" provider for the AI chat

`SttProvider` gains `"builtin"`, labelled **Built-in (Whisper base.en,
local)** in Settings → Models. The AI chat's mic then works with no key and
no server. The existing providers are unchanged, and the default stays as it
is.

### 4. Dictation in the terminal

- **Keys:** after the prefix, **Ctrl+Space** (or plain Space) toggles
  dictation. **v** after the prefix does the same, so it still works when the
  prefix itself is set to Ctrl+Space. **Esc** while listening cancels.
- **Provider:** dictation always uses the built-in local model, whatever the
  AI chat is set to, so terminal speech never goes to the cloud.
- **Where the text goes:** into the pane that was focused when dictation
  started, through the terminal's own paste (so shells with bracketed paste
  treat it as typed text). No Enter is added. Text is trimmed, runs of
  whitespace collapse to one space, and Whisper's markers like
  `[BLANK_AUDIO]` or `(music)` are dropped. Nothing heard means nothing
  typed.
- **Limit:** recording stops itself after 2 minutes.
- **First use:** if the model is missing, the first press downloads it, with
  progress in the message line. It does not start the microphone by itself
  afterwards; it says the model is ready and to press again.

### 5. The message line tells you what's happening

One line per state, updated in place (key `dictation`):

| State | Message | Kind |
|---|---|---|
| Downloading | `Downloading the speech model (60 MB): 42%.` | info, stays until done |
| Ready | `Speech model ready. Press Ctrl+B Ctrl+Space to dictate.` | success |
| Listening | `Listening in pane 2. Ctrl+B Ctrl+Space to stop, Esc to cancel.` | info, stays until stopped |
| Transcribing | `Transcribing…` | info, stays until done |
| Done | `Dictated 12 words into pane 2.` | success, click jumps to the pane |
| Nothing heard | `Heard nothing.` | info |
| Cancelled | `Dictation cancelled.` | info |
| Error | e.g. `Microphone access was refused.` / `The speech model download failed: …` | error |

`MessageInput` gains an optional `sticky` flag, so info messages like
"Listening" stay until replaced, not just errors.

### 6. Settings

In Settings → Models, under speech-to-text: the built-in model's status
(**Not downloaded** / **Ready, 60 MB**) with **Download** and **Remove**
buttons.

## Out of scope

- Words appearing while you speak (streaming). Text arrives when you stop.
- Rewriting or tidying what you said with an AI model, as Wispr Flow does.
- Languages other than English (base.en is English-only).
- Pressing Enter for you.

## Testing

Written first, logic only (the node test setup has no audio or webview):

- Text cleanup: markers dropped, whitespace collapsed, empty result.
- The dictation state machine: idle → listening → transcribing → idle;
  toggle; Esc cancels; the 2-minute stop; a missing model goes to
  downloading and then ready, not listening.
- Message wording for each state, and that `sticky` keeps a message up.
- Prefix keys: Ctrl+Space, Space and v after the prefix map to dictation.
- Rust: the checksum check accepts the right file and rejects a wrong one;
  the model path.

By hand on the Mac: the microphone prompt, a real dictation, the download,
and the AI chat's mic with "Built-in".

## Risks

- **Unsigned builds:** macOS remembers microphone permission per signature,
  so it may ask again after each update.
- **CI:** whisper.cpp compiles from source (needs cmake, which the GitHub
  macOS runner has). This adds to build time.
- **Accuracy:** base.en is good for clear speech and short commands, and
  weaker with jargon or noise.
