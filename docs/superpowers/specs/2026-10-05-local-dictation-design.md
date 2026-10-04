# Local dictation — design

Terax Tiling, branch `tuios-tiling-v086`. 2026-10-05.

## What it is

Speak into the terminal, like Wispr Flow, with nothing leaving the Mac.
Press **Ctrl+B, then Ctrl+Space**, talk, press it again: the words are typed
into the focused pane, not run. A local Whisper model does the work.

Agreed with the user:

- Model: **Whisper tiny.en by default, base.en optional** ("the smaller
  plan"), run by whisper.cpp inside Terax. Everything is open source
  (Whisper, whisper.cpp and the model files are MIT; the Rust binding,
  whisper-rs, is Unlicense).
- Size: as small as practical. tiny.en is **32.2 MB**
  (`ggml-tiny.en-q5_1.bin`), base.en **59.7 MB** (`ggml-base.en-q5_1.bin`);
  only the chosen one is downloaded, once, on first use. The engine is built
  for the CPU only (no Metal), using macOS's built-in Accelerate. Target:
  about 43 MB in all (app about 11 MB plus tiny.en).
- Memory: the model is unloaded after 5 minutes without dictation.
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
(0.16), CPU only: no `metal` feature. Two models, by id:

| id | file | bytes | SHA-256 |
|---|---|---|---|
| `tiny.en` (default) | `ggml-tiny.en-q5_1.bin` | 32,166,155 | `c77c5766f1cef09b6b7d47f21b546cbddd4157886b3b5d6d4f709e91e66c7c2b` |
| `base.en` | `ggml-base.en-q5_1.bin` | 59,721,011 | `4baf70dd0d7c4247ba2b81fafd9c01005ac77c2f9ef064e00dcf195d0e2fdd2f` |

Every command below takes the model id.

- `stt_model_status(model) -> { ready: bool, bytes: u64 }`: whether the
  model file is present at its full size.
- `stt_download_model(model)`: streams the file from Hugging Face
  (`ggerganov/whisper.cpp`) to a temporary file in the app's data folder,
  emits `stt://download` progress events (`{ model, received, total }`),
  checks the size and SHA-256 against the table, and only then renames it
  into place. A wrong checksum deletes the file and fails.
- `stt_remove_model(model)`: deletes it (Settings button), unloading it
  first if loaded.
- `stt_transcribe(model, samples: Vec<f32>) -> String`: 16 kHz mono samples
  in, text out. Runs on a blocking thread. The model is loaded on first use
  and kept until 5 minutes pass with no transcription, then dropped to free
  memory; language English; no timestamps; blank and non-speech tokens
  suppressed.

The download is the only network use, and it fetches the model, never audio.

### 2. Audio to samples (frontend)

The existing recorder gives a compressed blob. A new helper decodes it with
Web Audio and resamples it to 16 kHz mono with an `OfflineAudioContext`,
giving the `Float32Array` that `stt_transcribe` takes.

### 3. A "Built-in" provider for the AI chat

`SttProvider` gains `"builtin"`, labelled **Built-in (Whisper, local)** in
Settings → Models. The AI chat's mic then works with no key and
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
| Downloading | `Downloading the speech model (32 MB): 42%.` | info, stays until done |
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

In Settings → Models, under speech-to-text: a **Built-in model** choice
(**tiny.en, 32 MB, faster** / **base.en, 60 MB, more accurate**), its status
(**Not downloaded** / **Ready**) and **Download** / **Remove** buttons.
Switching models never deletes the other; Remove does.

## Live typing (added 2026-10-05)

Asked for after the first version: words now appear while you speak,
**typed into the pane about a second behind you**.

- The microphone is read live (Web Audio), resampled to 16 kHz per pass.
- About once a second (a pass starts only after the last one finishes),
  `stt_transcribe_live` re-reads the audio not yet trimmed, given the words
  typed so far as context, and returns phrases with times.
- A word is typed once two passes in a row agree on it (case and
  punctuation ignored), and is never taken back. The still-changing words
  show in the message line: `Listening in pane 2: …the tiling bug`.
- A phrase whose words are all typed has its audio trimmed, except the
  last phrase of a pass, so passes stay short.
- Pressing the key again does one last pass and types the rest. **Esc** now
  stops without typing the rest; words already typed stay (no backspacing
  into the pane).
- Cost: about one CPU core busy while you speak.

## Speed and the session switch (added 2026-10-05)

- Passes run 300 ms apart (was 1000 ms).
- Whisper encodes only the audio given plus a 64-frame margin
  (`audio_ctx`), not a padded 30 s; no temperature retries; threads = the
  performance cores (`hw.perflevel0.physicalcpu`).
- A **mic off / mic on** switch in the status bar, off at every start. On:
  download if needed, load (`stt_load`) and keep the model in memory (no
  idle unload). Off: `stt_unload` frees it. The keys only say how to turn it
  on while it's off.

## Out of scope

- Rewriting or tidying what you said with an AI model, as Wispr Flow does.
- Languages other than English (both models are English-only).
- The Apple GPU (Metal). CPU is enough for short clips with these models.
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
- **Accuracy:** tiny.en is fine for clear speech and short commands, and
  weaker with accents, jargon or noise; base.en is the fix, one setting away.
