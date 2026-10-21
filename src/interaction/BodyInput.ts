import { publish } from '../integrations/events';
import { signedDistance } from './field';
import { estimateUpperBodies, type UpperBody } from './upperBody';
export class BodyInput {
  readonly width = 192;
  readonly height = 108;
  target = new Float32Array(this.width * this.height).fill(2);
  lastMaskTime = 0;
  coverage = 0;
  upperBodies: UpperBody[] = [];
  running = false;
  private stream?: MediaStream;
  private worker?: Worker;
  private pending = false;
  private lastFrame = 0;
  private lastVideoTime = -1;
  private startedAt = 0;
  private submittedAt = 0;
  private generation = 0;
  private canvas = document.createElement('canvas');
  private context = this.canvas.getContext('2d', { willReadFrequently: true })!;
  constructor(private video: HTMLVideoElement, private status: (text: string) => void) {
    this.canvas.width = this.width; this.canvas.height = this.height;
  }
  async start() {
    this.stop();
    const generation = this.generation;
    this.status('正在请求摄像头并加载本地人体分割模型…');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('摄像头需要 localhost 或 HTTPS 环境。');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 30 } }, audio: false });
      if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream; this.video.srcObject = stream;
      await this.video.play();
      if (generation !== this.generation) return;
      this.worker = new Worker('/workers/segmentation.js');
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('模型初始化超时，请运行 npm run assets 后重试。')), 30000);
        this.worker!.onerror = e => { clearTimeout(timeout); reject(new Error(e.message)); };
        this.worker!.onmessage = ({ data }) => {
          if (data.type === 'ready') { clearTimeout(timeout); resolve(); }
          if (data.type === 'error') { clearTimeout(timeout); reject(new Error(data.message)); }
        };
        this.worker!.postMessage({ type: 'init' });
      });
      if (generation !== this.generation) return;
      this.worker!.onmessage = ({ data }) => {
        this.pending = false;
        if (data.type === 'mask') {
          const raw: Uint8Array = data.mask;
          // Resample model output to the fixed screen-space field grid.
          const mask = new Uint8Array(this.width * this.height);
          let sum = 0;
          for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
            const v = raw[Math.floor(y / this.height * data.height) * data.width + Math.floor(x / this.width * data.width)];
            mask[(this.height - 1 - y) * this.width + x] = v; sum += v > 127 ? 1 : 0;
          }
          this.coverage = sum / mask.length;
          this.target = signedDistance(mask, this.width, this.height);
          this.upperBodies = estimateUpperBodies(mask, this.width, this.height);
          this.lastMaskTime = performance.now();
          publish('presence', { coverage: this.coverage, timestamp: data.timestamp });
          this.status(`人体分割运行中 · 轮廓占比 ${(this.coverage * 100).toFixed(0)}%`);
        } else if (data.type === 'error') this.fail(data.message);
      };
      this.worker!.onerror = e => this.fail(e.message);
      this.stream.getVideoTracks()[0].onended = () => this.fail('摄像头已断开，请重新开启。');
      this.running = true; this.lastVideoTime = -1; this.startedAt = performance.now();
      this.status('摄像头已开启 · 等待第一帧人体分割');
    } catch (error) { this.fail(error instanceof Error ? error.message : String(error)); throw error; }
  }
  tick(now: number, fps: number, mirror: boolean) {
    if (this.running && ((this.pending && now - this.submittedAt > 5000) || now - (this.lastMaskTime || this.startedAt) > 8000)) {
      this.fail('人体分割超时，请重新开启摄像头。'); return;
    }
    if (!this.running || this.pending || now - this.lastFrame < 1000 / fps || this.video.readyState < 2 || this.lastVideoTime === this.video.currentTime) return;
    this.pending = true; this.lastFrame = now; this.submittedAt = now; this.lastVideoTime = this.video.currentTime;
    const ctx = this.context, w = this.width, h = this.height;
    // object-fit: cover, shared by preview and segmentation; mirrored exactly once.
    const scale = Math.max(w / this.video.videoWidth, h / this.video.videoHeight);
    const dw = this.video.videoWidth * scale, dh = this.video.videoHeight * scale;
    ctx.save(); ctx.clearRect(0, 0, w, h);
    if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(this.video, (w - dw) / 2, (h - dh) / 2, dw, dh); ctx.restore();
    const generation = this.generation;
    createImageBitmap(this.canvas).then(bitmap => {
      if (generation !== this.generation || !this.worker) { bitmap.close(); return; }
      this.worker.postMessage({ type: 'frame', bitmap, timestamp: now }, [bitmap]);
    }).catch(error => this.fail(String(error)));
  }
  private fail(message: string) { this.stop(); this.status(`摄像头不可用：${message}；可继续使用演示模式。`); }
  stop() {
    this.generation++; this.running = false; this.pending = false;
    this.worker?.terminate(); this.worker = undefined;
    this.stream?.getTracks().forEach(t => { t.onended = null; t.stop(); }); this.stream = undefined;
    this.video.srcObject = null; this.target.fill(2); this.lastMaskTime = 0; this.coverage = 0;
    this.upperBodies = [];
  }
}
