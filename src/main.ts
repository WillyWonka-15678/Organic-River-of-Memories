import GUI from 'lil-gui';
import './art.css';
import { config } from './config';
import { River } from './render/River';
import { BodyInput } from './interaction/BodyInput';
import { PresenceField } from './interaction/PresenceField';
import { demoSilhouette } from './interaction/demoSilhouette';
import { PoseTrack } from './interaction/PoseTrack';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const query = new URLSearchParams(location.search);
const requestedStage = Number(query.get('stage'));
if (requestedStage >= 1 && requestedStage <= 4) config.stage = requestedStage;
const status = (text: string) => { $('status').textContent = text.startsWith('人体分割运行中') ? '河流已感知你的身影' : text; };
const body = new BodyInput($<HTMLVideoElement>('video'), status);
const poseTrack=new PoseTrack();
const field = new PresenceField(body.width, body.height);
const preview = $<HTMLCanvasElement>('mask-preview');
preview.width = body.width; preview.height = body.height;
const previewCtx = preview.getContext('2d')!;
const previewImage = previewCtx.createImageData(body.width, body.height);
let river: River;
try { river = new River($<HTMLCanvasElement>('river'), config, field.texture); }
catch (error) { status(`GPU 初始化失败：${String(error)}`); throw error; }
const gui = new GUI({ title: '时光弹幕河 / 创作参数', width: 285 });
gui.add(config, 'stage', { '1 自然流场': 1, '2 人体感知': 2, '3 丝绸与光尘': 3, '4 记忆文字': 4 }).name('创作阶段');
gui.add(config, 'count', { '16,384': 16384, '32,768': 32768, '65,536': 65536, '131,072': 131072, '262,144': 262144 }).name('粒子数量').onFinishChange((v: number) => river.rebuild(v));
gui.add(config, 'speed', .03, .24, .005).name('河流速度');
gui.add(config, 'breathing', .4, 2, .01).name('流束舒展');
gui.add(config, 'noise', 0, 1.5, .01).name('局部流动');
gui.add(config, 'repulsion', 0, 1.5, .05).name('轮廓绕流');
gui.add(config, 'radius', .03, .25, .01).name('感知范围');
gui.add(config, 'recovery', .6, 4, .1).name('记忆消退 / 秒');
gui.add(config, 'silk', 0, 1, .01).name('丝绸层次');
gui.add(config, 'memories').name('记忆文字');
gui.add(config, 'exposure', .5, 2.5, .05).name('光感');
gui.add(config, 'trails', .75, .975, .005).name('视觉拖尾');
gui.add(config, 'size', 1, 4, .1).name('粒子尺寸');
gui.addColor(config, 'color').name('河流颜色');
gui.addColor(config, 'accent').name('记忆高光');
gui.add(config, 'demo').name('演示人体排斥');
gui.add(config, 'mirror').name('镜像摄像头');
gui.add(config, 'showMask').name('显示轮廓调试').onChange((v: boolean) => { preview.hidden = !v; });
gui.add(config, 'inferenceFps', 5, 30, 1).name('分割目标 FPS');
const stars=gui.addFolder('人体星座');
stars.add(config,'constellation').name('星座感知');
stars.add(config,'nodeSize',2,9,.1).name('节点大小');
stars.add(config,'nodeBrightness',.2,1.4,.02).name('节点亮度');
stars.add(config,'connectionOpacity',0,.65,.01).name('连接线透明度');
stars.add(config,'poseSmoothing',.035,.22,.005).name('运动平滑度 / 秒');
stars.add(config,'constellationTrails',.1,2,.05).name('星光拖尾 / 秒');
stars.add(config,'wristAttraction',0,1.5,.05).name('手腕吸引强度');
stars.close();
gui.add({ clear: () => river.clearTrails() }, 'clear').name('清除拖尾');
gui.hide();
function toggleDebug() { gui.show(gui._hidden); document.body.classList.toggle('debugging', !gui._hidden); }
$('debug').onclick = toggleDebug;
$('fullscreen').onclick = async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch (error) { status(`无法进入全屏：${String(error)}`); }
};
const cameraButton = $<HTMLButtonElement>('camera');
cameraButton.onclick = async () => {
  if (body.running) { body.stop(); cameraButton.textContent = '开启摄像头'; status('摄像头已关闭 · 记忆慢慢散去'); return; }
  cameraButton.disabled = true;
  try { await body.start(); cameraButton.textContent = body.running ? '关闭摄像头' : '开启摄像头'; }
  catch { cameraButton.textContent = '重试摄像头'; }
  finally { cameraButton.disabled = false; }
};
document.addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement && !['checkbox','range','button'].includes(event.target.type)) return;
  if (event.key.toLowerCase() === 'd') toggleDebug();
  if (event.key.toLowerCase() === 'h') document.body.classList.toggle('clean');
  if (event.key.toLowerCase() === 'f') $('fullscreen').click();
});
window.addEventListener('resize', () => river.resize());
$('river').addEventListener('webglcontextlost', event => { event.preventDefault(); status('GPU 上下文丢失，请重新加载页面恢复。'); });
let qaActive = false;
let qaPoseActive=false;
let timeOffset = 0;
if (import.meta.env.DEV && query.has('qa')) {
  Object.defineProperty(window, '__riverQA', { value: {
    injectSilhouette: (phase = 0) => { body.acceptMask(demoSilhouette(body.width, body.height, phase), performance.now()); qaActive = true; },
    clearMask: () => { body.acceptMask(new Uint8Array(body.width*body.height), performance.now()); qaActive = false; },
    sampleField: (x: number,y: number) => field.data[(Math.floor(y*body.height)*body.width+Math.floor(x*body.width))*4],
    seek: (time:number) => { timeOffset = time - (performance.now()-start)/1000; river.clearTrails(); },
    injectPose:(points:Parameters<BodyInput['acceptPose']>[0])=>{body.acceptPose(points);qaPoseActive=true;},
    clearPose:()=>{body.acceptPose([]);qaPoseActive=false;},
  }});
}
let previous = performance.now(), start = previous, sampleTime = previous, frames = 0;
let lastPreview = 0, lastDemo = 0;
const diagnostics = { frames: 0, fps: 0, time: 0, stage: config.stage, particleCount: config.count, camera: false, coverage: 0, lastMaskTime: 0, presence: 0, gpu: 'WebGL2 / float ping-pong' };
Object.defineProperty(window, '__river', { value: diagnostics });
function animate(now: number) {
  const dt = Math.min((now - previous) / 1000, .05); previous = now;
  const t = (now - start) / 1000 + timeOffset;
  body.tick(now, config.inferenceFps, config.mirror);
  if (!body.running && config.demo && now-lastDemo>100) {
    body.acceptMask(demoSilhouette(body.width,body.height,t),now); lastDemo = now;
  }
  const live = body.running && now-body.lastMaskTime<900;
  const active = config.stage>=2 && (live || qaActive || (!body.running && config.demo));
  field.update(body, active, dt, config.recovery);
  if (config.showMask && now-lastPreview>100) {
    lastPreview = now;
    for (let y=0;y<body.height;y++)for(let x=0;x<body.width;x++){
      const j=((body.height-1-y)*body.width+x)*4, k=(y*body.width+x)*4;
      const inside=field.data[j]<0;
      previewImage.data[k]=inside?150:4; previewImage.data[k+1]=inside?230:15;
      previewImage.data[k+2]=inside?215:24; previewImage.data[k+3]=255;
    }
    previewCtx.putImageData(previewImage,0,0);
  }
  poseTrack.update(body.pose,body.lastPoseTime,now,dt,config.poseSmoothing,innerWidth/innerHeight,config.constellation&&config.stage>=2&&(body.running||qaPoseActive));
  river.update(t,dt,field.presence,poseTrack); frames++;
  if (now-sampleTime>1000) {
    diagnostics.fps=Math.round(frames*1000/(now-sampleTime)); frames=0; sampleTime=now;
    $('metrics').textContent=`${diagnostics.fps} FPS / ${river.actualCount.toLocaleString()} PARTICLES / ${body.running?'CAMERA':active?'CONTOUR STUDY':'MEMORY RIVER'}`;
    if(!body.running)cameraButton.textContent='开启摄像头';
  }
  Object.assign(diagnostics,{ frames:diagnostics.frames+1,time:t,stage:config.stage,particleCount:river.actualCount,camera:body.running,coverage:body.coverage,lastMaskTime:body.lastMaskTime,presence:field.presence,
    poseReady:body.poseReady,lastPoseTime:body.lastPoseTime,poseNodes:poseTrack.visibleNodes,formation:poseTrack.formation,poseMotion:poseTrack.motion,
    wrists:[poseTrack.wrist(0),poseTrack.wrist(1)] });
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
window.addEventListener('pagehide',()=>{body.stop();river.dispose();field.texture.dispose();});
