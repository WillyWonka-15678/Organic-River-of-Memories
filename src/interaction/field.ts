// Signed distance: positive outside a person, negative inside; units = screen height.
// Two chamfer transforms keep deep interior gradients, avoiding a flat binary-mask trap.
export function distanceTransform(mask: Uint8Array, width: number, height: number, foreground: boolean, aspect = width / height) {
  const d = new Float32Array(width * height);
  for (let i = 0; i < d.length; i++) d[i] = (mask[i] > 127) === foreground ? 0 : 1e4;
  const horizontal = aspect * height / width;
  const diagonal = Math.hypot(horizontal, 1);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (x) d[i] = Math.min(d[i], d[i - 1] + horizontal);
    if (y) {
      d[i] = Math.min(d[i], d[i - width] + 1);
      if (x) d[i] = Math.min(d[i], d[i - width - 1] + diagonal);
      if (x + 1 < width) d[i] = Math.min(d[i], d[i - width + 1] + diagonal);
    }
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const i = y * width + x;
    if (x + 1 < width) d[i] = Math.min(d[i], d[i + 1] + horizontal);
    if (y + 1 < height) {
      d[i] = Math.min(d[i], d[i + width] + 1);
      if (x) d[i] = Math.min(d[i], d[i + width - 1] + diagonal);
      if (x + 1 < width) d[i] = Math.min(d[i], d[i + width + 1] + diagonal);
    }
  }
  return d;
}
export function signedDistance(mask: Uint8Array, width: number, height: number, aspect = width / height) {
  const outside = distanceTransform(mask, width, height, true, aspect);
  const inside = distanceTransform(mask, width, height, false, aspect);
  return Float32Array.from(outside, (v, i) => Math.max(-2, Math.min(2, (v - inside[i]) / height)));
}
export function easingAlpha(dt: number, seconds: number) { return 1 - Math.exp(-dt / Math.max(0.01, seconds)); }
