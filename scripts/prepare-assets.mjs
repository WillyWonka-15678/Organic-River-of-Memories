import { mkdir, cp, access, writeFile } from 'node:fs/promises';
await mkdir('public/models', { recursive: true });
await cp('node_modules/@mediapipe/tasks-vision/wasm', 'public/mediapipe', { recursive: true });
const path = 'public/models/selfie_segmenter_landscape.tflite';
try { await access(path); } catch {
  const response = await fetch('https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite');
  if (!response.ok) throw new Error(`模型下载失败: ${response.status}`);
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
}
console.log('MediaPipe WASM 与人体分割模型已准备到 public/，运行时无需 CDN。');
