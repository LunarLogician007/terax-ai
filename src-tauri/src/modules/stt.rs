//! Built-in speech-to-text (Terax Tiling): whisper.cpp on the CPU, with a
//! model downloaded once into the app's data folder. Audio never leaves the
//! Mac; the only network use is fetching the model file itself.

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
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

struct Loaded {
    id: &'static str,
    ctx: WhisperContext,
    last_used: Instant,
}

#[derive(Default)]
pub struct SttState {
    loaded: Arc<Mutex<Option<Loaded>>>,
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
pub async fn stt_download_model(app: AppHandle, model: String) -> Result<(), String> {
    let spec = model_spec(&model)?;
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

/// 16 kHz mono f32 samples in (raw bytes, model id in a header), text out.
#[tauri::command]
pub async fn stt_transcribe(
    app: AppHandle,
    state: State<'_, SttState>,
    request: Request<'_>,
) -> Result<String, String> {
    let model = request
        .headers()
        .get(MODEL_HEADER)
        .and_then(|v| v.to_str().ok())
        .ok_or("the speech model wasn't named")?;
    let spec = model_spec(model)?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw audio".into());
    };
    let samples = pad_to_min(samples_from_le_bytes(bytes)?);
    let path = model_path(&models_dir(&app)?, spec);
    let loaded = state.loaded.clone();
    let text = tauri::async_runtime::spawn_blocking(move || {
        transcribe_blocking(&loaded, spec, &path, &samples)
    })
    .await
    .map_err(|e| e.to_string())??;
    schedule_unload(state.loaded.clone());
    Ok(text)
}

fn threads() -> i32 {
    std::thread::available_parallelism()
        .map(|n| n.get().min(4) as i32)
        .unwrap_or(2)
}

fn transcribe_blocking(
    loaded: &Mutex<Option<Loaded>>,
    spec: &'static ModelSpec,
    path: &Path,
    samples: &[f32],
) -> Result<String, String> {
    let mut guard = loaded
        .lock()
        .map_err(|_| "the speech model is unavailable".to_string())?;
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
    let Some(entry) = guard.as_mut() else {
        return Err("the speech model is unavailable".into());
    };
    entry.last_used = Instant::now();
    let mut state = entry.ctx.create_state().map_err(|e| e.to_string())?;
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_language(Some("en"));
    params.set_n_threads(threads());
    params.set_no_timestamps(true);
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
    let mut text = String::new();
    for segment in state.as_iter() {
        if let Ok(s) = segment.to_str_lossy() {
            text.push_str(&s);
        }
    }
    entry.last_used = Instant::now();
    Ok(text.trim().to_string())
}

fn schedule_unload(loaded: Arc<Mutex<Option<Loaded>>>) {
    std::thread::spawn(move || {
        std::thread::sleep(IDLE_UNLOAD + Duration::from_secs(1));
        if let Ok(mut guard) = loaded.lock() {
            if guard
                .as_ref()
                .is_some_and(|l| l.last_used.elapsed() >= IDLE_UNLOAD)
            {
                *guard = None;
            }
        }
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
    fn model_path_is_in_the_folder() {
        let p = model_path(Path::new("/tmp/models"), &MODELS[0]);
        assert_eq!(p, Path::new("/tmp/models/ggml-tiny.en-q5_1.bin"));
    }
}
