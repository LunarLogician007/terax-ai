import type { LiveMic } from "./controller";
import { downsample } from "./resample";

const SAMPLE_RATE = 16_000;
// ScriptProcessor's block: about 85 ms at 48 kHz.
const BLOCK = 4096;

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

/**
 * The microphone, read live for dictation: raw blocks are kept at the
 * device rate and resampled to 16 kHz when a pass asks for them.
 */
export async function startLiveMic(): Promise<LiveMic> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const ctx = new AudioContext();
  try {
    // WebKit lets a context run while the page is capturing audio.
    await ctx.resume();
  } catch {
    // Already running.
  }
  const rate = ctx.sampleRate;
  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessor is deprecated but needs no worklet module, which keeps
  // this free of extra files and CSP rules; WebKit supports it.
  const node = ctx.createScriptProcessor(BLOCK, 1, 1);
  let blocks: Float32Array[] = [];
  let length = 0;
  node.onaudioprocess = (e) => {
    const block = e.inputBuffer.getChannelData(0);
    blocks.push(block.slice());
    length += block.length;
  };
  source.connect(node);
  // A processor only runs when connected; it writes silence.
  node.connect(ctx.destination);

  const flat = (): Float32Array => {
    const out = new Float32Array(length);
    let at = 0;
    for (const b of blocks) {
      out.set(b, at);
      at += b.length;
    }
    blocks = [out];
    return out;
  };
  const release = () => {
    node.onaudioprocess = null;
    source.disconnect();
    node.disconnect();
    for (const t of stream.getTracks()) t.stop();
    void ctx.close();
  };

  return {
    snapshot: () => downsample(flat(), rate, SAMPLE_RATE),
    trim: (ms) => {
      const rest = flat().slice(
        Math.min(length, Math.floor((ms * rate) / 1000)),
      );
      blocks = [rest];
      length = rest.length;
    },
    stop: () => {
      const out = downsample(flat(), rate, SAMPLE_RATE);
      release();
      return out;
    },
    cancel: release,
  };
}
