//! Built-in speech-to-text (Terax Tiling): whisper.cpp on the CPU, with a
//! model downloaded once into the app's data folder. Audio never leaves the
//! Mac; the only network use is fetching the model file itself.

use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Emitter, Manager, State};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

pub struct ModelSpec {
    pub id: &'static str,
    pub file: &'static str,
    pub bytes: u64,
    pub sha256: &'static str,
}

/// The models on offer, from ggerganov/whisper.cpp on Hugging Face (MIT).
pub const MODELS: &[ModelSpec] = &[
    ModelSpec {
        id: "tiny.en",
        file: "ggml-tiny.en-q5_1.bin",
        bytes: 32_166_155,
        sha256: "c77c5766f1cef09b6b7d47f21b546cbddd4157886b3b5d6d4f709e91e66c7c2b",
    },
    ModelSpec {
        id: "base.en",
        file: "ggml-base.en-q5_1.bin",
        bytes: 59_721_011,
        sha256: "4baf70dd0d7c4247ba2b81fafd9c01005ac77c2f9ef064e00dcf195d0e2fdd2f",
    },
];

const MODEL_BASE_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/";
const SAMPLE_RATE: usize = 16_000;
/// whisper.cpp skips input under a second; pad short clips with silence.
const MIN_SAMPLES: usize = SAMPLE_RATE * 11 / 10;
/// Drop the loaded model after this long without a transcription.
const IDLE_UNLOAD: Duration = Duration::from_secs(5 * 60);
pub const DOWNLOAD_EVENT: &str = "stt://download";
const MODEL_HEADER: &str = "x-stt-model";
/// The encoder's frames per second of audio (1500 for Whisper's 30 s).
const FRAMES_PER_SEC: usize = 50;
const MAX_AUDIO_CTX: usize = 1500;
/// Context past the end of the audio, so the last word isn't clipped.
const AUDIO_CTX_MARGIN: usize = 64;

/// Encode only as much as was said: Whisper otherwise always encodes 30 s,
/// most of it silence, which is most of a short pass's time.
pub fn audio_ctx_for(samples: usize) -> i32 {
    let frames = samples.div_ceil(SAMPLE_RATE / FRAMES_PER_SEC) + AUDIO_CTX_MARGIN;
    frames.clamp(128, MAX_AUDIO_CTX) as i32
}

pub fn model_spec(id: &str) -> Result<&'static ModelSpec, String> {
    MODELS
        .iter()
        .find(|m| m.id == id)
        .ok_or_else(|| format!("Unknown speech model: {id}"))
}

pub fn model_path(dir: &Path, spec: &ModelSpec) -> PathBuf {
    dir.join(spec.file)
}

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("models"))
        .map_err(|e| e.to_string())
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn check_digest(actual_hex: &str, spec: &ModelSpec) -> Result<(), String> {
    if actual_hex.eq_ignore_ascii_case(spec.sha256) {
        Ok(())
    } else {
        Err("the speech model's checksum doesn't match".into())
    }
}

/// The file at `path` has the model's exact size and SHA-256.
pub fn verify_file(path: &Path, spec: &ModelSpec) -> Result<(), String> {
    let len = fs::metadata(path).map_err(|e| e.to_string())?.len();
    if len != spec.bytes {
        return Err(format!("expected {} bytes, found {len}", spec.bytes));
    }
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 16];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    check_digest(&hex(&hasher.finalize()), spec)
}

/// Little-endian f32 samples, as a `Float32Array`'s bytes arrive.
pub fn samples_from_le_bytes(bytes: &[u8]) -> Result<Vec<f32>, String> {
    if bytes.len() % 4 != 0 {
        return Err("the audio isn't whole 32-bit samples".into());
    }
    Ok(bytes
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect())
}

pub fn pad_to_min(mut samples: Vec<f32>) -> Vec<f32> {
    if samples.len() < MIN_SAMPLES {
        samples.resize(MIN_SAMPLES, 0.0);
    }
    samples
}

/// A live pass's body: a little-endian u32 prompt length, the prompt as
/// UTF-8, then the f32 samples.
pub fn split_prompt(bytes: &[u8]) -> Result<(String, &[u8]), String> {
    if bytes.len() < 4 {
        return Err("the audio is missing its header".into());
    }
    let len = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize;
    let rest = &bytes[4..];
    if rest.len() < len {
        return Err("the prompt runs past the end of the audio".into());
    }
    let prompt = String::from_utf8_lossy(&rest[..len]).into_owned();
    Ok((prompt, &rest[len..]))
}

/// whisper-rs panics on a NUL byte in the prompt; keep it short, too.
pub fn sanitize_prompt(prompt: &str) -> String {
    let clean: String = prompt.chars().filter(|&c| c != '\0').collect();
    let start = clean.len().saturating_sub(400);
    let mut cut = start;
    while !clean.is_char_boundary(cut) {
        cut += 1;
    }
    clean[cut..].trim().to_string()
}

/// One phrase from Whisper, times in ms from the start of the audio given.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    text: String,
    start_ms: i64,
    end_ms: i64,
}

struct Loaded {
    id: &'static str,
    ctx: WhisperContext,
    last_used: Instant,
}

#[derive(Default)]
pub struct SttState {
    loaded: Arc<Mutex<Option<Loaded>>>,
    /// An idle-unload watcher is running (one at most).
    unload_watch: Arc<AtomicBool>,
    /// Dictation is switched on: keep the model in memory, never unload it
    /// for being idle.
    pinned: Arc<AtomicBool>,
    /// Models being downloaded now. The settings window and the main window
    /// can both ask; only one may write the file.
    downloading: Arc<Mutex<HashSet<&'static str>>>,
}

/// Marks a model as downloading until dropped.
struct DownloadGuard {
    set: Arc<Mutex<HashSet<&'static str>>>,
    id: &'static str,
}

impl DownloadGuard {
    fn claim(set: &Arc<Mutex<HashSet<&'static str>>>, id: &'static str) -> Option<Self> {
        let mut held = set.lock().ok()?;
        if !held.insert(id) {
            return None;
        }
        Some(Self {
            set: set.clone(),
            id,
        })
    }
}

impl Drop for DownloadGuard {
    fn drop(&mut self) {
        if let Ok(mut held) = self.set.lock() {
            held.remove(self.id);
        }
    }
}

impl SttState {
    fn unload_if(&self, id: &str) {
        if let Ok(mut guard) = self.loaded.lock() {
            if guard.as_ref().map(|l| l.id) == Some(id) {
                *guard = None;
            }
        }
    }
}

#[derive(Serialize)]
pub struct ModelStatus {
    ready: bool,
    bytes: u64,
}

#[derive(Clone, Serialize)]
struct DownloadProgress {
    model: &'static str,
    received: u64,
    total: u64,
}

/// Whether the model is on disk at full size (checked by hash when downloaded).
#[tauri::command]
pub fn stt_model_status(app: AppHandle, model: String) -> Result<ModelStatus, String> {
    let spec = model_spec(&model)?;
    let path = model_path(&models_dir(&app)?, spec);
    let ready = fs::metadata(&path)
        .map(|m| m.len() == spec.bytes)
        .unwrap_or(false);
    Ok(ModelStatus {
        ready,
        bytes: spec.bytes,
    })
}

/// Fetch the model into a `.part` file, hashing as it streams, and move it
/// into place only once its size and checksum match.
#[tauri::command]
pub async fn stt_download_model(
    app: AppHandle,
    state: State<'_, SttState>,
    model: String,
) -> Result<(), String> {
    let spec = model_spec(&model)?;
    let Some(_guard) = DownloadGuard::claim(&state.downloading, spec.id) else {
        return Err("it's already downloading".into());
    };
    let dir = models_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let dest = model_path(&dir, spec);
    let part = dir.join(format!("{}.part", spec.file));
    if let Err(e) = download_to(&app, spec, &part).await {
        let _ = fs::remove_file(&part);
        return Err(e);
    }
    fs::rename(&part, &dest).map_err(|e| e.to_string())
}

async fn download_to(app: &AppHandle, spec: &'static ModelSpec, part: &Path) -> Result<(), String> {
    let url = format!("{MODEL_BASE_URL}{}", spec.file);
    let res = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("the server answered {}", res.status()));
    }
    let mut file = File::create(part).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut received: u64 = 0;
    let mut last_pct = u64::MAX;
    let mut stream = res.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        received += chunk.len() as u64;
        if received > spec.bytes {
            return Err("the download is larger than the model should be".into());
        }
        hasher.update(&chunk);
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        let pct = received * 100 / spec.bytes;
        if pct != last_pct {
            last_pct = pct;
            let _ = app.emit(
                DOWNLOAD_EVENT,
                DownloadProgress {
                    model: spec.id,
                    received,
                    total: spec.bytes,
                },
            );
        }
    }
    file.sync_all().map_err(|e| e.to_string())?;
    if received != spec.bytes {
        return Err(format!("expected {} bytes, got {received}", spec.bytes));
    }
    check_digest(&hex(&hasher.finalize()), spec)
}

#[tauri::command]
pub fn stt_remove_model(app: AppHandle, state: State<'_, SttState>, model: String) -> Result<(), String> {
    let spec = model_spec(&model)?;
    state.unload_if(spec.id);
    match fs::remove_file(model_path(&models_dir(&app)?, spec)) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Dictation switched on: load the model now and keep it in memory.
#[tauri::command]
pub async fn stt_load(
    app: AppHandle,
    state: State<'_, SttState>,
    model: String,
) -> Result<(), String> {
    let spec = model_spec(&model)?;
    let path = model_path(&models_dir(&app)?, spec);
    let loaded = state.loaded.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = loaded
            .lock()
            .map_err(|_| "the speech model is unavailable".to_string())?;
        ensure_loaded(&mut guard, spec, &path)
    })
    .await
    .map_err(|e| e.to_string())??;
    state.pinned.store(true, Ordering::SeqCst);
    Ok(())
}

/// Dictation switched off: free the model's memory.
#[tauri::command]
pub fn stt_unload(state: State<'_, SttState>) {
    state.pinned.store(false, Ordering::SeqCst);
    if let Ok(mut guard) = state.loaded.lock() {
        *guard = None;
    }
}

fn model_from(request: &Request<'_>) -> Result<&'static ModelSpec, String> {
    let model = request
        .headers()
        .get(MODEL_HEADER)
        .and_then(|v| v.to_str().ok())
        .ok_or("the speech model wasn't named")?;
    model_spec(model)
}

fn raw_body<'a>(request: &'a Request<'_>) -> Result<&'a [u8], String> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes.as_slice()),
        _ => Err("expected raw audio".into()),
    }
}

async fn transcribe_async(
    app: &AppHandle,
    state: &SttState,
    spec: &'static ModelSpec,
    samples: Vec<f32>,
    prompt: String,
    timestamps: bool,
) -> Result<Vec<Segment>, String> {
    let path = model_path(&models_dir(app)?, spec);
    let loaded = state.loaded.clone();
    let samples = pad_to_min(samples);
    let segments = tauri::async_runtime::spawn_blocking(move || {
        run_whisper(&loaded, spec, &path, &samples, &prompt, timestamps)
    })
    .await
    .map_err(|e| e.to_string())??;
    if !state.pinned.load(Ordering::SeqCst) {
        watch_idle(
            state.loaded.clone(),
            state.unload_watch.clone(),
            state.pinned.clone(),
        );
    }
    Ok(segments)
}

/// 16 kHz mono f32 samples in (raw bytes, model id in a header), text out.
#[tauri::command]
pub async fn stt_transcribe(
    app: AppHandle,
    state: State<'_, SttState>,
    request: Request<'_>,
) -> Result<String, String> {
    let spec = model_from(&request)?;
    let samples = samples_from_le_bytes(raw_body(&request)?)?;
    let segments = transcribe_async(&app, &state, spec, samples, String::new(), false).await?;
    let text: String = segments.iter().map(|s| s.text.as_str()).collect();
    Ok(text.trim().to_string())
}

/// A live dictation pass: prompt + samples in (see `split_prompt`), phrases
/// with times out, so typed phrases can be trimmed from the audio.
#[tauri::command]
pub async fn stt_transcribe_live(
    app: AppHandle,
    state: State<'_, SttState>,
    request: Request<'_>,
) -> Result<Vec<Segment>, String> {
    let spec = model_from(&request)?;
    let (prompt, audio) = split_prompt(raw_body(&request)?)?;
    let samples = samples_from_le_bytes(audio)?;
    transcribe_async(&app, &state, spec, samples, sanitize_prompt(&prompt), true).await
}

/// Performance cores on Apple Silicon: splitting the work onto efficiency
/// cores too makes every pass wait for the slowest of them.
#[cfg(target_os = "macos")]
fn performance_cores() -> Option<usize> {
    let name = c"hw.perflevel0.physicalcpu";
    let mut value: libc::c_int = 0;
    let mut size = std::mem::size_of::<libc::c_int>();
    // SAFETY: a valid C string, and an int-sized out buffer with its size.
    let rc = unsafe {
        libc::sysctlbyname(
            name.as_ptr(),
            (&mut value as *mut libc::c_int).cast(),
            &mut size,
            std::ptr::null_mut(),
            0,
        )
    };
    (rc == 0 && value > 0).then_some(value as usize)
}

#[cfg(not(target_os = "macos"))]
fn performance_cores() -> Option<usize> {
    None
}

fn threads() -> i32 {
    let cores = performance_cores().unwrap_or_else(|| {
        std::thread::available_parallelism()
            .map(|n| n.get().min(4))
            .unwrap_or(2)
    });
    cores.clamp(1, 8) as i32
}

/// Make sure `spec` is the model in memory, loading it (and dropping any
/// other) if not.
fn ensure_loaded(
    guard: &mut Option<Loaded>,
    spec: &'static ModelSpec,
    path: &Path,
) -> Result<(), String> {
    if guard.as_ref().map(|l| l.id) != Some(spec.id) {
        // Only one model in memory: drop the other before loading.
        *guard = None;
        if !path.exists() {
            return Err("The speech model isn't downloaded.".into());
        }
        // Without a log backend this silences whisper.cpp's stderr chatter.
        whisper_rs::install_logging_hooks();
        let mut params = WhisperContextParameters::default();
        params.use_gpu(false);
        let ctx = WhisperContext::new_with_params(path, params)
            .map_err(|e| format!("Couldn't load the speech model: {e}"))?;
        *guard = Some(Loaded {
            id: spec.id,
            ctx,
            last_used: Instant::now(),
        });
    }
    Ok(())
}

fn run_whisper(
    loaded: &Mutex<Option<Loaded>>,
    spec: &'static ModelSpec,
    path: &Path,
    samples: &[f32],
    prompt: &str,
    timestamps: bool,
) -> Result<Vec<Segment>, String> {
    let mut guard = loaded
        .lock()
        .map_err(|_| "the speech model is unavailable".to_string())?;
    ensure_loaded(&mut guard, spec, path)?;
    let Some(entry) = guard.as_mut() else {
        return Err("the speech model is unavailable".into());
    };
    entry.last_used = Instant::now();
    let mut state = entry.ctx.create_state().map_err(|e| e.to_string())?;
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_language(Some("en"));
    params.set_n_threads(threads());
    params.set_no_timestamps(!timestamps);
    params.set_audio_ctx(audio_ctx_for(samples.len()));
    // One decode per pass: no retries at higher temperatures, which can
    // multiply a pass's time when Whisper is unsure.
    params.set_temperature_inc(0.0);
    if !prompt.is_empty() {
        params.set_initial_prompt(prompt);
    }
    params.set_no_context(true);
    params.set_suppress_blank(true);
    params.set_suppress_nst(true);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    state
        .full(params, samples)
        .map_err(|e| format!("Transcription failed: {e}"))?;
    let mut segments = Vec::new();
    for segment in state.as_iter() {
        if let Ok(text) = segment.to_str_lossy() {
            segments.push(Segment {
                text: text.into_owned(),
                // whisper.cpp counts in centiseconds.
                start_ms: segment.start_timestamp() * 10,
                end_ms: segment.end_timestamp() * 10,
            });
        }
    }
    entry.last_used = Instant::now();
    Ok(segments)
}

/// Drop the model once it has gone unused for IDLE_UNLOAD. One watcher
/// thread at most, however many passes run.
fn watch_idle(
    loaded: Arc<Mutex<Option<Loaded>>>,
    running: Arc<AtomicBool>,
    pinned: Arc<AtomicBool>,
) {
    if running.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(move || loop {
        let idle = match loaded.lock() {
            Ok(guard) => guard.as_ref().map(|l| l.last_used.elapsed()),
            Err(_) => None,
        };
        let wait = match idle {
            Some(idle) if idle < IDLE_UNLOAD => IDLE_UNLOAD - idle,
            Some(_) => {
                // Switched on since: the model stays.
                if pinned.load(Ordering::SeqCst) {
                    running.store(false, Ordering::SeqCst);
                    return;
                }
                if let Ok(mut guard) = loaded.lock() {
                    if guard
                        .as_ref()
                        .is_some_and(|l| l.last_used.elapsed() >= IDLE_UNLOAD)
                    {
                        *guard = None;
                    }
                }
                running.store(false, Ordering::SeqCst);
                return;
            }
            None => {
                running.store(false, Ordering::SeqCst);
                return;
            }
        };
        std::thread::sleep(wait + Duration::from_millis(500));
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    // SHA-256 of "hello".
    const HELLO: ModelSpec = ModelSpec {
        id: "test",
        file: "test.bin",
        bytes: 5,
        sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    };

    #[test]
    fn finds_both_models_and_rejects_unknown() {
        assert_eq!(model_spec("tiny.en").unwrap().bytes, 32_166_155);
        assert_eq!(model_spec("base.en").unwrap().file, "ggml-base.en-q5_1.bin");
        assert!(model_spec("large").is_err());
    }

    #[test]
    fn model_checksums_are_sha256_hex() {
        for m in MODELS {
            assert_eq!(m.sha256.len(), 64, "{}", m.id);
            assert!(m.sha256.chars().all(|c| c.is_ascii_hexdigit()), "{}", m.id);
        }
    }

    #[test]
    fn verify_accepts_the_right_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("m.bin");
        fs::write(&path, b"hello").unwrap();
        assert_eq!(verify_file(&path, &HELLO), Ok(()));
    }

    #[test]
    fn verify_rejects_wrong_content_of_the_right_size() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("m.bin");
        fs::write(&path, b"jello").unwrap();
        assert!(verify_file(&path, &HELLO).is_err());
    }

    #[test]
    fn verify_rejects_the_wrong_size() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("m.bin");
        fs::write(&path, b"hello!").unwrap();
        assert!(verify_file(&path, &HELLO).unwrap_err().contains("bytes"));
    }

    #[test]
    fn digest_check_ignores_case() {
        assert!(check_digest(&HELLO.sha256.to_uppercase(), &HELLO).is_ok());
    }

    #[test]
    fn samples_round_trip_from_bytes() {
        let want = [0.5f32, -1.0, 0.25];
        let bytes: Vec<u8> = want.iter().flat_map(|s| s.to_le_bytes()).collect();
        assert_eq!(samples_from_le_bytes(&bytes).unwrap(), want);
        assert!(samples_from_le_bytes(&bytes[..5]).is_err());
    }

    #[test]
    fn short_clips_are_padded_long_ones_kept() {
        assert_eq!(pad_to_min(vec![0.1; 10]).len(), MIN_SAMPLES);
        assert_eq!(pad_to_min(vec![0.1; MIN_SAMPLES + 7]).len(), MIN_SAMPLES + 7);
    }

    #[test]
    fn only_one_download_per_model_at_a_time() {
        let set = Arc::new(Mutex::new(HashSet::new()));
        let first = DownloadGuard::claim(&set, "tiny.en");
        assert!(first.is_some());
        assert!(DownloadGuard::claim(&set, "tiny.en").is_none());
        assert!(DownloadGuard::claim(&set, "base.en").is_some());
        drop(first);
        assert!(DownloadGuard::claim(&set, "tiny.en").is_some());
    }

    #[test]
    fn live_body_splits_into_prompt_and_audio() {
        let mut body = 3u32.to_le_bytes().to_vec();
        body.extend_from_slice(b"git");
        body.extend_from_slice(&0.5f32.to_le_bytes());
        let (prompt, audio) = split_prompt(&body).unwrap();
        assert_eq!(prompt, "git");
        assert_eq!(samples_from_le_bytes(audio).unwrap(), vec![0.5]);
        assert!(split_prompt(&[1, 0]).is_err());
        assert!(split_prompt(&9u32.to_le_bytes()).is_err());
    }

    #[test]
    fn prompts_lose_nul_bytes_and_keep_the_last_words() {
        assert_eq!(sanitize_prompt("git\0 status"), "git status");
        let long = "word ".repeat(200);
        let clean = sanitize_prompt(&long);
        assert!(clean.len() <= 400);
        assert!(clean.ends_with("word"));
        assert_eq!(sanitize_prompt("é".repeat(300).as_str()).chars().count(), 200);
    }

    #[test]
    fn audio_ctx_follows_the_audio_length() {
        // 2 s → 100 frames + margin; never under 128, never over Whisper's 1500.
        assert_eq!(audio_ctx_for(2 * SAMPLE_RATE), 164);
        assert_eq!(audio_ctx_for(10), 128);
        assert_eq!(audio_ctx_for(60 * SAMPLE_RATE), 1500);
        // A partial frame still counts.
        assert_eq!(audio_ctx_for(2 * SAMPLE_RATE + 1), 165);
    }

    #[test]
    fn uses_at_least_one_thread_and_at_most_eight() {
        let n = threads();
        assert!((1..=8).contains(&n), "{n}");
    }

    #[test]
    fn model_path_is_in_the_folder() {
        let p = model_path(Path::new("/tmp/models"), &MODELS[0]);
        assert_eq!(p, Path::new("/tmp/models/ggml-tiny.en-q5_1.bin"));
    }
}
