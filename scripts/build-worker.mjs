import { build } from 'esbuild';
import { access } from 'node:fs/promises';
for (const path of ['public/models/selfie_segmenter_landscape.tflite', 'public/mediapipe/vision_wasm_internal.wasm']) {
  try { await access(path); } catch { throw new Error(`缺少 ${path}，请先执行 npm run assets。`); }
}
// MediaPipe's WASM loader uses importScripts; ship an actual classic Worker in dev and production.
await build({ entryPoints: ['src/interaction/segmentation.worker.ts'], outfile: 'public/workers/segmentation.js', bundle: true, format: 'iife', platform: 'browser', target: 'es2022', minify: true });
