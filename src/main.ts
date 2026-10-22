import { palettes, type PaletteName } from './render/ColorSystem';
import GUI from 'lil-gui';
import './art.css';
import { config } from './config';
import { River } from './render/River';
import { BodyInput } from './interaction/BodyInput';
import { PresenceField } from './interaction/PresenceField';
import { demoSilhouette } from './interaction/demoSilhouette';
import { PoseTrack } from './interaction/PoseTrack';
import { torsoSample, headSample } from './interaction/BodyWake';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const query = new URLSearchParams(location.search);
if(query.has('palette')&&query.get('palette')! in palettes)config.palette=query.get('palette')!;
const requestedStage = Number(query.get('stage'));
if (requestedStage >= 1 && requestedStage <= 4) config.stage = requestedStage;
if(['off','only','composite'].includes(query.get('wake')??''))config.wakeMode=query.get('wake')!;
if(query.get('input')==='mouse')config.wakeInput='mouse';
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
const colors=gui.addFolder('视觉配色');
colors.add(config,'palette',{'A · Original':'original','B · Teal & Violet':'tealViolet','C · Iridescent':'iridescent'}).name('配色预设').listen();
colors.add(config,'secondaryRatio',0,.4,.01).name('辅助色比例');
colors.add(config,'saturation',.35,1.2,.01).name('饱和度');
colors.add(config,'colorSpeed',0,2,.05).name('颜色变化速度');
colors.add(config,'interactionColor',0,1.5,.05).name('交互色彩强度');
colors.add(config,'bloom',0,.6,.01).name('Bloom 柔光');
colors.close();
gui.add(config, 'demo').name('演示人体排斥');
gui.add(config, 'mirror').name('镜像摄像头');
gui.add(config, 'showMask').name('显示轮廓调试').onChange((v: boolean) => { preview.hidden = !v; });
gui.add(config, 'inferenceFps', 5, 30, 1).name('分割目标 FPS');
const memoryPanel=gui.addFolder('记忆交互');
memoryPanel.add(config,'memoryCount',1,6,1).name('漂流留言上限');
memoryPanel.add(config,'memoryInterval',3,20,.5).name('生成间隔 / 秒');
memoryPanel.add(config,'memorySpeed',.01,.06,.001).name('文字漂流速度');
memoryPanel.add(config,'bodyTextSlowdown',.03,.15,.01).name('人体内速度倍率');
memoryPanel.add(config,'captureRadius',.08,.3,.01).name('拾忆范围');
memoryPanel.add(config,'captureHold',.4,1.5,.05).name('伸手停留 / 秒');
memoryPanel.add(config,'memoryReleaseTime',2,6,.1).name('送别消散 / 秒');
memoryPanel.close();
const stars=gui.addFolder('人体星座');
stars.add(config,'constellation').name('星座感知');
stars.add(config,'nodeSize',2,9,.1).name('节点大小');
stars.add(config,'nodeBrightness',.2,1.4,.02).name('节点亮度');
stars.add(config,'connectionOpacity',0,.65,.01).name('连接线透明度');
stars.add(config,'poseSmoothing',.035,.22,.005).name('运动平滑度 / 秒');
stars.add(config,'constellationTrails',.1,2,.05).name('星光拖尾 / 秒');
stars.add(config,'wristAttraction',0,1.5,.05).name('手腕吸引强度');
stars.add(config,'bodyStarDensity',.1,1,.02).name('身体星尘密度');
stars.add(config,'bodyWeb',0,1.5,.05).name('身体细网');
stars.add(config,'bodyAura',0,1.5,.05).name('轮廓光雾');
stars.close();
const wakes=gui.addFolder('人体尾涡 / Body Wake');
wakes.add(config,'wakeEnabled').name('启用尾涡');
wakes.add(config,'wakeMode',{'关闭':'off','仅尾涡':'only','河流合成':'composite'}).name('观察模式');
wakes.add(config,'wakeInput',{'人体':'pose','鼠标轨迹':'mouse'}).name('运动来源').onChange(()=>river.wake.clear());
wakes.add(config,'wakeThreshold',.015,.15,.005).name('横移速度阈值');
wakes.add(config,'wakeSmoothing',.08,.6,.01).name('运动平滑 / 秒');
wakes.add(config,'wakeInterval',.65,3,.05).name('生成间隔 / 秒');
wakes.add(config,'wakeSpacing',.04,.3,.01).name('最小生成间距');
wakes.add(config,'wakeRadius',.025,.16,.005).name('尾涡半径');
wakes.add(config,'wakeRotation',.01,.12,.005).name('旋转强度');
wakes.add(config,'wakeDirection',{'交替':'alternating','顺时针':'clockwise','逆时针':'counterclockwise','随机':'random'}).name('旋转方向');
wakes.add(config,'wakeLifetime',4,18,.5).name('生命周期 / 秒');
wakes.add(config,'wakeExpansion',0,.12,.005).name('扩散速率');
wakes.add(config,'wakeDissipation',.5,3,.1).name('消散速率');
wakes.add(config,'wakeAdvection',.2,1.2,.05).name('随河流漂移');
wakes.add(config,'wakeDensity',.15,1,.05).name('光丝粒子密度');
wakes.add(config,'wakeMaximum',1,6,1).name('尾涡数量上限');
wakes.add(config,'riverProtection',0,1,.05).name('主河流保护');
wakes.close();
const pointer={x:.5,y:.5,valid:false};
$('river').addEventListener('pointermove',event=>{pointer.x=event.clientX/innerWidth;pointer.y=1-event.clientY/innerHeight;pointer.valid=true;});
$('river').addEventListener('pointerleave',()=>{pointer.valid=false;});
gui.add({ clear: () => river.clearTrails() }, 'clear').name('清除拖尾');
gui.hide();
function toggleDebug() { gui.show(gui._hidden); document.body.classList.toggle('debugging', !gui._hidden); }
$('debug').onclick = toggleDebug;
$('fullscreen').onclick = async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch (error) { status(`无法进入全屏：${String(error)}`); }
};
const cameraButton = $<HTMLButtonElement>('camera');
let cameraStart:Promise<void>|undefined;
async function startCamera(){
  if(cameraStart)return cameraStart;
  cameraButton.disabled = true;
  cameraButton.textContent='正在开启摄像头…';
  cameraStart=(async()=>{
    try { await body.start(); cameraButton.textContent = body.running ? '关闭摄像头' : '开启摄像头'; }
    catch { cameraButton.textContent = '开启摄像头'; }
    finally { cameraButton.disabled = false; cameraStart=undefined; }
  })();
  return cameraStart;
}
cameraButton.onclick = async () => {
  if (body.running) { body.stop(); cameraButton.textContent = '开启摄像头'; status('摄像头已关闭 · 记忆慢慢散去'); return; }
  await startCamera();
};
// Request permission as soon as the experience opens; browsers still require the visitor to grant it.
if(query.get('camera')!=='off')void startCamera();
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
let studyPaused=false;let studyTime=0;
let timeOffset = 0;
if (import.meta.env.DEV && query.has('qa')) {
  Object.defineProperty(window, '__riverQA', { value: {
    memoryState:()=>river.memories.interaction.items.map(m=>({...m})),
    placeMemory:(x:number,y:number)=>river.memories.interaction.spawn({id:'qa-memory',message:'愿你始终热爱'},x,y),
    clearMemories:()=>{river.memories.interaction.items=[];},
    pauseStudy:()=>{studyPaused=true;studyTime=diagnostics.time;},
    paletteStudy:(preset:PaletteName)=>{if(!(preset in palettes))throw new Error('Unknown palette');studyPaused=true;river.renderPaletteStudy(preset,studyTime,field.presence,poseTrack);},
    setPalette:(preset:PaletteName)=>{if(preset in palettes)config.palette=preset;},
    particleStudyState:()=>river.particleStudyState(),
    colorState:()=>({preset:config.palette,mix:river.colors.uniforms.uPaletteMix.value,phase:river.colors.uniforms.uColorPhase.value,bloom:river.colors.bloom}),
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
let wakeMapping='';
const diagnostics = { frames: 0, fps: 0, time: 0, stage: config.stage, particleCount: config.count, camera: false, coverage: 0, lastMaskTime: 0, presence: 0, gpu: 'WebGL2 / float ping-pong' };
Object.defineProperty(window, '__river', { value: diagnostics });
function animate(now: number) {
  if(studyPaused){previous=now;requestAnimationFrame(animate);return;}
  const wakeDt=Math.max(0,(now-previous)/1000);
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
  poseTrack.update(body.pose,body.lastPoseTime,now,dt,config.poseSmoothing,innerWidth/innerHeight,(config.constellation||config.memories)&&config.stage>=2&&(body.running||qaPoseActive));
  const aspect=innerWidth/innerHeight,mapping=`${aspect}:${config.mirror}:${config.wakeInput}`;
  if(mapping!==wakeMapping){river.wake.motion.reset();river.wake.headMotion.reset();wakeMapping=mapping;}
  const motionSample=config.wakeInput==='mouse'?{...pointer,width:.15,stamp:now/1000}:torsoSample(body.pose,body.lastPoseTime/1000,aspect);
  if(config.wakeInput==='pose'&&!body.running&&!qaPoseActive)motionSample.valid=false;
  river.wake.motion.sample(motionSample,now/1000,aspect,config.wakeThreshold,config.wakeSmoothing);
  const head=headSample(body.pose,body.lastPoseTime/1000,aspect);
  if(config.wakeInput!=='pose'||(!body.running&&!qaPoseActive))head.valid=false;
  river.wake.headMotion.sample(head,now/1000,aspect,config.wakeThreshold*1.15,config.wakeSmoothing*1.25);
  river.wake.update(wakeDt,t,innerWidth/innerHeight,config);
  // Text follows elapsed time even below 20 FPS; cap long background-tab gaps.
  river.update(t,dt,field.presence,poseTrack,Math.min(wakeDt,.25)); frames++;
  if (now-sampleTime>1000) {
    diagnostics.fps=Math.round(frames*1000/(now-sampleTime)); frames=0; sampleTime=now;
    $('metrics').textContent=`${diagnostics.fps} FPS / ${river.actualCount.toLocaleString()} PARTICLES / ${body.running?'CAMERA':active?'CONTOUR STUDY':'MEMORY RIVER'}`;
    if(!body.running&&!cameraStart)cameraButton.textContent='开启摄像头';
  }
  Object.assign(diagnostics,{ frames:diagnostics.frames+1,time:t,stage:config.stage,particleCount:river.actualCount,camera:body.running,coverage:body.coverage,lastMaskTime:body.lastMaskTime,presence:field.presence,
    poseReady:body.poseReady,lastPoseTime:body.lastPoseTime,poseNodes:poseTrack.visibleNodes,formation:poseTrack.formation,poseMotion:poseTrack.motion,
    wrists:[poseTrack.wrist(0),poseTrack.wrist(1)],wakeCount:river.wake.wakes.filter(Boolean).length,wakeSpawned:river.wake.spawned,wakeMoving:river.wake.motion.moving,
    wakes:river.wake.wakes.filter(Boolean).map(w=>({...w})),wakeVelocity:river.wake.motion.vx,headWakeMoving:river.wake.headMotion.moving,headWakePosition:{x:river.wake.headMotion.x,y:river.wake.headMotion.y} });
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
window.addEventListener('pagehide',()=>{body.stop();river.dispose();field.texture.dispose();});
