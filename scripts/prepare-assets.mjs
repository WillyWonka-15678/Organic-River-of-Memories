import { mkdir, cp, access, writeFile, rename } from 'node:fs/promises';
await mkdir('public/models', { recursive: true });
await cp('node_modules/@mediapipe/tasks-vision/wasm', 'public/mediapipe', { recursive: true });
const path = 'public/models/selfie_segmenter_landscape.tflite';
try { await access(path); } catch {
  const response = await fetch('https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite');
  if (!response.ok) throw new Error(`模型下载失败: ${response.status}`);
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
}
console.log('MediaPipe WASM 与人体分割模型已准备到 public/，运行时无需 CDN。');
const posePath = 'public/models/pose_landmarker_lite.task';
try { await access(posePath); } catch {
  const response = await fetch('https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`姿态模型下载失败: ${response.status}`);
  await writeFile(`${posePath}.download`, Buffer.from(await response.arrayBuffer()));
  await rename(`${posePath}.download`, posePath);
}
console.log('单人 Pose Landmarker Lite 已准备，星座识别不依赖 CDN。');
