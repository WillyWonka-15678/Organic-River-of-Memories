import * as THREE from 'three';
import GUI from 'lil-gui';
import './style.css';
import { config } from './config';
import { River } from './render/River';
import { BodyInput } from './interaction/BodyInput';
import { easingAlpha } from './interaction/field';
import { upperBodyOffset, type UpperBody } from './interaction/upperBody';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = (text: string) => { $('status').textContent = text; };
const body = new BodyInput($<HTMLVideoElement>('video'), status);
const fieldData = new Float32Array(body.width * body.height * 4);
for (let i = 0; i < fieldData.length; i += 4) fieldData[i] = 2;
const texture = new THREE.DataTexture(fieldData, body.width, body.height, THREE.RGBAFormat, THREE.FloatType);
texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
const preview = $<HTMLCanvasElement>('mask-preview');
preview.width = body.width; preview.height = body.height;
const previewCtx = preview.getContext('2d')!;
const previewImage = previewCtx.createImageData(body.width, body.height);
let river: River;
try { river = new River($<HTMLCanvasElement>('river'), config, texture); }
catch (error) { status(`GPU 初始化失败：${String(error)}`); throw error; }
const gui = new GUI({ title: '时光弹幕河 / 实时调试', width: 285 });
gui.add(config, 'count', { '16,384': 16384, '32,768': 32768, '65,536': 65536, '131,072': 131072, '262,144': 262144 }).name('粒子数量').onFinishChange((v: number) => river.rebuild(v));
gui.add(config, 'speed', .01, .6, .01).name('河流速度');
gui.add(config, 'repulsion', 0, 1.5, .05).name('上下避让强度');
gui.add(config, 'radius', .02, .20, .01).name('头胸避让余量');
gui.add(config, 'waveAmplitude', 0, .07, .001).name('波浪起伏');
gui.add(config, 'waveLength', .6, 3, .05).name('波浪长度');
gui.add(config, 'waveSpeed', 0, .25, .01).name('波浪变化速度');
gui.add(config, 'noise', 0, .3, .01).name('细微起伏');
gui.add(config, 'trails', .5, .985, .005).name('视觉拖尾');
gui.add(config, 'size', 1, 5, .1).name('粒子尺寸');
gui.addColor(config, 'color').name('河流颜色');
gui.addColor(config, 'accent').name('暖色点缀');
gui.add(config, 'recovery', .1, 2, .05).name('恢复时间 / 秒');
gui.add(config, 'demo').name('演示人体排斥');
gui.add(config, 'mirror').name('镜像摄像头');
gui.add(config, 'showMask').name('显示轮廓调试').onChange((v: boolean) => { preview.hidden = !v; });
gui.add(config, 'inferenceFps', 5, 30, 1).name('分割目标 FPS');
gui.add({ clear: () => river.clearTrails() }, 'clear').name('清除拖尾');
gui.hide();
$('debug').onclick = () => gui.show(gui._hidden);
$('fullscreen').onclick = async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch (error) { status(`无法进入全屏：${String(error)}`); }
};
const cameraButton = $<HTMLButtonElement>('camera');
cameraButton.onclick = async () => {
  if (body.running) { body.stop(); cameraButton.textContent = '开启摄像头'; status('摄像头已关闭 · 河流逐渐恢复'); return; }
  cameraButton.disabled = true;
  try { await body.start(); cameraButton.textContent = body.running ? '关闭摄像头' : '开启摄像头'; }
  catch { cameraButton.textContent = '重试摄像头'; }
  finally { cameraButton.disabled = false; }
};
document.addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement && !['checkbox', 'range', 'button'].includes(event.target.type)) return;
  if (event.key.toLowerCase() === 'd') gui.show(gui._hidden);
  if (event.key.toLowerCase() === 'h') document.body.classList.toggle('clean');
  if (event.key.toLowerCase() === 'f') $('fullscreen').click();
});
window.addEventListener('resize', () => river.resize());
const canvas = $<HTMLCanvasElement>('river');
canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); status('GPU 上下文丢失，请重新加载页面恢复。'); });
let previous = performance.now(), start = previous, sampleTime = previous, frames = 0, displayFps = 0;
let lastPreview = 0;
function animate(now: number) {
  const dt = Math.min((now - previous) / 1000, .05); previous = now;
  const t = (now - start) / 1000;
  body.tick(now, config.inferenceFps, config.mirror);
  const live = body.running && now - body.lastMaskTime < 700;
  const demo = !body.running && config.demo;
  // Attack quickly; release slowly when people leave or camera results become stale.
  const attack = easingAlpha(dt, .075), release = easingAlpha(dt, config.recovery);
  const centerX = .5 + Math.sin(t * .28) * .15;
  const aspect = innerWidth / innerHeight;
  const demoBody: UpperBody = { x: centerX, headY: .66, chestY: .43, headRx: .07, headRy: .09, chestRx: .13, chestRy: .16 };
  const upperBodies = live ? body.upperBodies : demo ? [demoBody] : [];
  const response = upperBodies.length ? easingAlpha(dt, .16) : release;
  for (let y = 0; y < body.height; y++) for (let x = 0; x < body.width; x++) {
    const i = y * body.width + x;
    let target = live ? body.target[i] : 2;
    if (demo) {
      const px = ((x + .5) / body.width - centerX) * aspect, py = (y + .5) / body.height;
      const torso = (Math.hypot(px / demoBody.chestRx, (py - demoBody.chestY) / demoBody.chestRy) - 1) * demoBody.chestRx;
      const head = (Math.hypot(px / demoBody.headRx, (py - demoBody.headY) / demoBody.headRy) - 1) * demoBody.headRx;
      target = Math.min(torso, head);
    }
    const current = fieldData[i * 4];
    // Bound release distance: a jump to the empty-field sentinel must not erase
    // repulsion in one or two frames when a person leaves.
    fieldData[i * 4] += target < current ? (target - current) * attack : Math.min(target - current, .35) * release;
    const offset = upperBodyOffset((x + .5) / body.width, (y + .5) / body.height, upperBodies, aspect, config.radius, config.repulsion);
    fieldData[i * 4 + 1] += (offset - fieldData[i * 4 + 1]) * response;
  }
  texture.needsUpdate = true;
  if (config.showMask && now - lastPreview > 100) {
    lastPreview = now;
    for (let y = 0; y < body.height; y++) for (let x = 0; x < body.width; x++) {
      const d = fieldData[((body.height - 1 - y) * body.width + x) * 4];
      const i = (y * body.width + x) * 4;
      previewImage.data[i] = d < 0 ? 180 : 5; previewImage.data[i + 1] = d < 0 ? 240 : 20;
      previewImage.data[i + 2] = d < 0 ? 215 : 30; previewImage.data[i + 3] = 255;
    }
    previewCtx.putImageData(previewImage, 0, 0);
    previewCtx.strokeStyle = '#e7b77a'; previewCtx.lineWidth = 1;
    for (const upper of upperBodies) {
      for (const [cy, rx, ry] of [[upper.headY, upper.headRx, upper.headRy], [upper.chestY, upper.chestRx, upper.chestRy]]) {
        previewCtx.beginPath();
        previewCtx.ellipse(upper.x * body.width, (1 - cy) * body.height, rx * body.height, ry * body.height, 0, 0, Math.PI * 2);
        previewCtx.stroke();
      }
    }
  }
  river.update(t, dt); frames++;
  if (now - sampleTime > 1000) {
    displayFps = Math.round(frames * 1000 / (now - sampleTime)); frames = 0; sampleTime = now;
    $('metrics').textContent = `${displayFps} FPS / ${river.actualCount.toLocaleString()} PARTICLES / ${body.running ? 'CAMERA' : demo ? 'DEMO BODY' : 'FREE FLOW'}`;
    if (!body.running) cameraButton.textContent = '开启摄像头';
  }
  // Read-only diagnostics for browser QA and later on-site performance logging.
  Object.assign(diagnostics, { frames: diagnostics.frames + 1, fps: displayFps, particleCount: river.actualCount, camera: body.running, coverage: body.coverage, lastMaskTime: body.lastMaskTime });
  requestAnimationFrame(animate);
}
const diagnostics = { frames: 0, fps: 0, particleCount: config.count, camera: false, coverage: 0, lastMaskTime: 0, gpu: 'WebGL2 / float ping-pong' };
Object.defineProperty(window, '__river', { value: diagnostics });
requestAnimationFrame(animate);
window.addEventListener('pagehide', () => { body.stop(); river.dispose(); texture.dispose(); });
