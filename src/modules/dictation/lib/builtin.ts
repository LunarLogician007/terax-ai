import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Seg } from "./agreement";
import type { ModelId } from "./text";

/** The built-in Whisper model's commands (src-tauri/src/modules/stt.rs). */

type Progress = { model: string; received: number; total: number };

export async function modelReady(model: ModelId): Promise<boolean> {
  const s = await invoke<{ ready: boolean; bytes: number }>(
    "stt_model_status",
    {
      model,
    },
  );
  return s.ready;
}

export async function downloadModel(
  model: ModelId,
  onPct: (pct: number) => void,
): Promise<void> {
  const unlisten = await listen<Progress>("stt://download", (e) => {
    if (e.payload.model !== model || e.payload.total <= 0) return;
    onPct(Math.floor((e.payload.received * 100) / e.payload.total));
  });
  try {
    await invoke("stt_download_model", { model });
  } finally {
    unlisten();
  }
}

export function removeModel(model: ModelId): Promise<void> {
  return invoke("stt_remove_model", { model });
}

/** 16 kHz mono samples to text, sent as raw bytes (no JSON). */
export async function transcribeSamples(
  model: ModelId,
  samples: Float32Array,
): Promise<string> {
  if (samples.length === 0) return "";
  const bytes = new Uint8Array(
    samples.buffer,
    samples.byteOffset,
    samples.byteLength,
  );
  return invoke<string>("stt_transcribe", bytes, {
    headers: { "x-stt-model": model },
  });
}

/**
 * A live pass: phrases with times. The body is a little-endian u32 prompt
 * length, the prompt (UTF-8), then the samples (see stt.rs split_prompt).
 */
export async function transcribeLive(
  model: ModelId,
  samples: Float32Array,
  prompt: string,
): Promise<Seg[]> {
  if (samples.length === 0) return [];
  const text = new TextEncoder().encode(prompt);
  const body = new Uint8Array(4 + text.length + samples.byteLength);
  new DataView(body.buffer).setUint32(0, text.length, true);
  body.set(text, 4);
  body.set(
    new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength),
    4 + text.length,
  );
  return invoke<Seg[]>("stt_transcribe_live", body, {
    headers: { "x-stt-model": model },
  });
}
