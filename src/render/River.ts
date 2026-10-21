import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import type { RiverConfig } from '../config';
import { simulation, particleVertex, particleFragment, fullscreenVertex, fadeFragment, displayFragment, highlightFragment, blurFragment } from './organicShaders';
import { SilkLayers } from './SilkLayers';
import { MemoryLayer } from '../memories/MemoryLayer';
import { HumanConstellation } from './HumanConstellation';
import type { PoseTrack } from '../interaction/PoseTrack';

export class River {
  renderer: THREE.WebGLRenderer;
  private compute!: GPUComputationRenderer;
  private variable!: ReturnType<GPUComputationRenderer['addVariable']>;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private points!: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private quadScene = new THREE.Scene();
  private quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private fade = new THREE.ShaderMaterial({ vertexShader: fullscreenVertex, fragmentShader: fadeFragment, uniforms: { uPrevious: { value: null }, uDecay: { value: 0.93 } }, depthTest: false, depthWrite: false });
  private display = new THREE.ShaderMaterial({ vertexShader: fullscreenVertex, fragmentShader: displayFragment, uniforms: { uPrevious: { value: null }, uGlow:{value:null},uBloom:{value:0}, uExposure: { value: 1.35 } }, depthTest: false, depthWrite: false });
  private highlight=new THREE.ShaderMaterial({vertexShader:fullscreenVertex,fragmentShader:highlightFragment,uniforms:{uPrevious:{value:null}},depthTest:false,depthWrite:false});
  private blur=new THREE.ShaderMaterial({vertexShader:fullscreenVertex,fragmentShader:blurFragment,uniforms:{uPrevious:{value:null},uDirection:{value:new THREE.Vector2()}},depthTest:false,depthWrite:false});
  private glow=[0,1].map(()=>new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false}));
  private silk: SilkLayers;
  private memories: MemoryLayer;
  private memoryScene=new THREE.Scene();
  private constellation:HumanConstellation;
  private initializing = true;
  private targets: THREE.WebGLRenderTarget[];
  private active = 0;
  actualCount = 0;
  constructor(canvas: HTMLCanvasElement, private config: RiverConfig, private field: THREE.DataTexture) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    if (!this.renderer.extensions.has('EXT_color_buffer_float')) throw new Error('此设备无法使用浮点 GPU 粒子计算，请开启浏览器硬件加速并更新显卡驱动。');
    if (!this.renderer.extensions.has('OES_texture_float_linear')) {
      this.field.minFilter = THREE.NearestFilter; this.field.magFilter = THREE.NearestFilter;
    }
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.autoClear = false;
    this.targets = [0,1].map(() => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }));
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.fade);
    this.quadScene.add(this.quad);
    this.silk=new SilkLayers(field);this.scene.add(this.silk.mesh);
    this.memories=new MemoryLayer(field,this.renderer.getPixelRatio());this.memoryScene.add(this.memories.points);
    this.constellation=new HumanConstellation(this.renderer.getPixelRatio(),field);
    this.rebuild(config.count);
    this.resize();
  }
  rebuild(count: number) {
    if (this.points) {
      this.scene.remove(this.points); this.points.geometry.dispose(); this.points.material.dispose(); this.compute.dispose();
    }
    const side = Math.ceil(Math.sqrt(count));
    this.actualCount = count;
    this.compute = new GPUComputationRenderer(side, side, this.renderer);
    const initial = this.compute.createTexture();
    const data = initial.image.data;
    for (let i = 0; i < data.length; i += 4) {
      // Independent probabilities feed four weighted streams and a sparse dust layer.
      data[i] = Math.random(); data[i + 1] = Math.random();
      data[i + 2] = Math.random(); data[i + 3] = Math.random();
    }
    this.variable = this.compute.addVariable('texturePosition', simulation, initial);
    this.compute.setVariableDependencies(this.variable, [this.variable]);
    Object.assign(this.variable.material.uniforms, {
      uTime: { value: 0 }, uDt: { value: 0 }, uSpeed: { value: 0 }, uNoise: { value: 0 },
      uBreathing: { value: 1 }, uInit: { value: 1 },
      uAspect: { value: 1 }, uField: { value: this.field }, uSeeds: { value: initial },
      uStage: { value: 1 }, uPresence: { value: 0 }, uRepulsion: { value: 0 }, uRadius: { value: .13 },
      uFieldSize: { value: new THREE.Vector2(this.field.image.width,this.field.image.height) },
      uWrists:{value:[new THREE.Vector4(),new THREE.Vector4()]},uHandForce:{value:0},
    });
    const error = this.compute.init();
    if (error) throw new Error(error);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const refs = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) { refs[i * 2] = ((i % side) + .5) / side; refs[i * 2 + 1] = (Math.floor(i / side) + .5) / side; }
    geometry.setAttribute('reference', new THREE.BufferAttribute(refs, 2));
    const material = new THREE.ShaderMaterial({ vertexShader: particleVertex, fragmentShader: particleFragment,
      uniforms: { uPositions: { value: null }, uSeeds: { value: initial }, uField:{value:this.field},uStage:{value:1},uPresence:{value:0},uTime: { value: 0 }, uSize: { value: 2 }, uPixelRatio: { value: this.renderer.getPixelRatio() }, uColor: { value: new THREE.Color() }, uAccent: { value: new THREE.Color() } },
      transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
    this.points = new THREE.Points(geometry, material); this.points.frustumCulled = false; this.scene.add(this.points);
    this.initializing = true;
    this.clearTrails();
  }
  clearTrails() {
    for (const target of [...this.targets,...this.glow]) { this.renderer.setRenderTarget(target); this.renderer.clear(); }
    this.renderer.setRenderTarget(null);
  }
  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.targets.forEach(t => t.setSize(size.x, size.y)); this.clearTrails();
    this.glow.forEach(t=>t.setSize(Math.max(1,Math.ceil(size.x/4)),Math.max(1,Math.ceil(size.y/4))));
  }
  update(time: number, dt: number, presence: number, pose:PoseTrack) {
    const c = this.config, u = this.variable.material.uniforms;
    u.uTime.value = time; u.uDt.value = dt; u.uSpeed.value = c.speed; u.uNoise.value = c.noise;
    u.uBreathing.value = c.breathing; u.uInit.value = this.initializing ? 1 : 0;
    u.uAspect.value = innerWidth / innerHeight;
    u.uStage.value = c.stage; u.uPresence.value = presence; u.uRepulsion.value = c.repulsion; u.uRadius.value = c.radius;
    u.uHandForce.value=c.constellation&&c.stage>=2?c.wristAttraction:0;
    for(let i=0;i<2;i++){const hand=pose.wrist(i as 0|1);u.uWrists.value[i].set(hand.x,hand.y,hand.strength,hand.activity);}
    this.constellation.update(pose,time,dt,innerWidth/innerHeight,c,presence);
    this.compute.compute();
    this.initializing = false;
    const p = this.points.material.uniforms;
    p.uPositions.value = this.compute.getCurrentRenderTarget(this.variable).texture;
    p.uTime.value = time;
    p.uStage.value=c.stage;p.uPresence.value=presence;
    this.silk.mesh.visible=c.stage>=3;
    this.silk.update(time,innerWidth/innerHeight,c.breathing,presence,c.silk,c.color,c.accent);
    this.memories.points.visible=c.stage>=4&&c.memories;
    this.memories.update(time,innerWidth/innerHeight,presence,c.color,c.accent);
    p.uSize.value = c.size; p.uColor.value.set(c.color); p.uAccent.value.set(c.accent);
    const next = 1 - this.active;
    this.fade.uniforms.uPrevious.value = this.targets[this.active].texture;
    this.fade.uniforms.uDecay.value = Math.pow(c.trails, dt * 60);
    this.quad.material = this.fade;
    this.renderer.setRenderTarget(this.targets[next]);
    this.renderer.render(this.quadScene, this.camera);
    this.renderer.render(this.scene, this.camera);
    if(c.stage>=3){
      this.highlight.uniforms.uPrevious.value=this.targets[next].texture;this.quad.material=this.highlight;
      this.renderer.setRenderTarget(this.glow[0]);this.renderer.render(this.quadScene,this.camera);
      this.blur.uniforms.uPrevious.value=this.glow[0].texture;this.blur.uniforms.uDirection.value.set(1/this.glow[0].width,0);this.quad.material=this.blur;
      this.renderer.setRenderTarget(this.glow[1]);this.renderer.render(this.quadScene,this.camera);
      this.blur.uniforms.uPrevious.value=this.glow[1].texture;this.blur.uniforms.uDirection.value.set(0,1/this.glow[0].height);
      this.renderer.setRenderTarget(this.glow[0]);this.renderer.render(this.quadScene,this.camera);
    }
    this.renderer.setRenderTarget(null);
    this.display.uniforms.uPrevious.value = this.targets[next].texture;
    this.display.uniforms.uExposure.value = c.exposure;
    this.display.uniforms.uGlow.value=this.glow[0].texture;this.display.uniforms.uBloom.value=c.stage>=3?.28:0;
    this.quad.material = this.display;
    this.renderer.render(this.quadScene, this.camera);
    // Typography is composed freshly in the same WebGL coordinates: its own
    // gather/scatter motion supplies persistence without smearing readable glyphs.
    if(c.stage>=4&&c.memories)this.renderer.render(this.memoryScene,this.camera);
    if(c.constellation&&c.stage>=2)this.renderer.render(this.constellation.scene,this.camera);
    this.active = next;
  }
  dispose() {
    this.compute.dispose(); this.points.geometry.dispose(); this.points.material.dispose();
    this.targets.forEach(t => t.dispose()); this.quad.geometry.dispose(); this.fade.dispose(); this.display.dispose(); this.renderer.dispose();
    this.glow.forEach(t=>t.dispose());this.blur.dispose();this.highlight.dispose();this.silk.dispose();
    this.memories.dispose();
    this.constellation.dispose();
  }
}
