/// <reference lib="webworker" />
import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
let segmenter: ImageSegmenter | undefined;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const files = await FilesetResolver.forVisionTasks('/mediapipe');
      // CPU inference in a dedicated Worker avoids competing with rendering for the GPU.
      segmenter = await ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/models/selfie_segmenter_landscape.tflite', delegate: 'CPU' },
        canvas: new OffscreenCanvas(256, 144),
        runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true,
      });
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'frame' && segmenter) {
      const bitmap: ImageBitmap = data.bitmap;
      try {
        segmenter.segmentForVideo(bitmap, data.timestamp, result => {
          // Landscape selfie model has one sigmoid output: person confidence.
          // Two-class models instead expose separate background/person masks.
          const masks = result.confidenceMasks!;
          const mask = masks.length === 1 ? masks[0] : masks[1];
          const source = mask.getAsFloat32Array();
          const bytes = Uint8Array.from(source, v => v > 0.55 ? 255 : 0);
          self.postMessage({ type: 'mask', mask: bytes, width: mask.width, height: mask.height, timestamp: data.timestamp }, [bytes.buffer]);
        });
      } finally { bitmap.close(); }
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
