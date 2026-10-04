/**
 * Resample mono audio down to `to` Hz by averaging the source samples that
 * fall in each output sample (a box filter, which also keeps aliasing down).
 */
export function downsample(
  input: Float32Array,
  from: number,
  to = 16_000,
): Float32Array {
  if (from === to) return input.slice();
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}
