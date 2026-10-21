/// <reference lib="webworker" />
import { FilesetResolver, ImageSegmenter, PoseLandmarker } from '@mediapipe/tasks-vision';
let segmenter: ImageSegmenter | undefined;
let pose: PoseLandmarker | undefined;
let lastPose = -Infinity;
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
      try {
        pose = await PoseLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: '/models/pose_landmarker_lite.task', delegate: 'CPU' },
          canvas: new OffscreenCanvas(640,360), runningMode: 'VIDEO', numPoses: 1,
          minPoseDetectionConfidence: .55, minPosePresenceConfidence: .55, minTrackingConfidence: .55,
          outputSegmentationMasks: false,
        });
      } catch (error) {
        self.postMessage({ type: 'pose-warning', message: String(error) });
      }
      lastPose = -Infinity;
      self.postMessage({ type: 'ready', poseReady: !!pose });
    } else if (data.type === 'frame' && segmenter) {
      const bitmap: ImageBitmap = data.bitmap;
      try {
        let landmarks: {x:number;y:number;z:number;visibility:number;presence?:number}[] | undefined;
        if (pose && data.timestamp-lastPose>=1000/15) {
          try {
            pose.detectForVideo(bitmap,data.timestamp,result=>{
              landmarks=(result.landmarks[0]??[]).map(p=>({x:p.x,y:p.y,z:p.z,visibility:p.visibility}));
            });
            lastPose=data.timestamp;
          } catch(error) {
            pose.close();pose=undefined;landmarks=[];
            self.postMessage({type:'pose-warning',message:String(error)});
          }
        }
        segmenter.segmentForVideo(bitmap, data.timestamp, result => {
          // Landscape selfie model has one sigmoid output: person confidence.
          // Two-class models instead expose separate background/person masks.
          const masks = result.confidenceMasks!;
          const mask = masks.length === 1 ? masks[0] : masks[1];
          const source = mask.getAsFloat32Array();
          const bytes = Uint8Array.from(source, v => v > 0.55 ? 255 : 0);
          self.postMessage({ type: 'mask', mask: bytes, width: mask.width, height: mask.height, timestamp: data.timestamp, landmarks, poseReady:!!pose }, [bytes.buffer]);
        });
      } finally { bitmap.close(); }
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
