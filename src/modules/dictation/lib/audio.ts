import type { Recording } from "./controller";

const SAMPLE_RATE = 16_000;
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
}

/** Decode recorded audio and resample it to the 16 kHz mono Whisper takes. */
export async function toMono16k(blob: Blob): Promise<Float32Array> {
  if (blob.size === 0) return new Float32Array(0);
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const length = Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE));
    // One output channel: Web Audio mixes the input down to mono.
    const offline = new OfflineAudioContext(1, length, SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0).slice();
  } finally {
    void ctx.close();
  }
}

/** Start the microphone; stop() hands back 16 kHz mono samples. */
export async function startMicRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const mimeType = pickMime();
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const release = () => {
    for (const t of stream.getTracks()) t.stop();
  };
  rec.start();
  return {
    stop: () =>
      new Promise<Float32Array>((resolve, reject) => {
        rec.onstop = () => {
          release();
          const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
          toMono16k(blob).then(resolve, reject);
        };
        if (rec.state === "inactive") rec.onstop(new Event("stop"));
        else rec.stop();
      }),
    cancel: () => {
      rec.onstop = null;
      if (rec.state !== "inactive") rec.stop();
      release();
    },
  };
}
