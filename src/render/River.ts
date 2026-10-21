import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import type { RiverConfig } from '../config';
import { simulation, particleVertex, particleFragment, fullscreenVertex, fadeFragment, displayFragment } from './shaders';

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
  private display = new THREE.ShaderMaterial({ vertexShader: fullscreenVertex, fragmentShader: displayFragment, uniforms: { uPrevious: { value: null } }, depthTest: false, depthWrite: false });
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
    this.targets = [new THREE.WebGLRenderTarget(1, 1), new THREE.WebGLRenderTarget(1, 1)];
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.fade);
    this.quadScene.add(this.quad);
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
      data[i] = Math.random(); data[i + 1] = .06 + (Math.floor(Math.random() * 48) + .5) / 48 * .88 + (Math.random() - .5) * .006;
      data[i + 2] = 1; data[i + 3] = 0;
    }
    this.variable = this.compute.addVariable('texturePosition', simulation, initial);
    this.compute.setVariableDependencies(this.variable, [this.variable]);
    Object.assign(this.variable.material.uniforms, {
      uTime: { value: 0 }, uDt: { value: 0 }, uSpeed: { value: 0 }, uNoise: { value: 0 },
      uWaveAmplitude: { value: 0 }, uWaveLength: { value: 1 }, uWaveSpeed: { value: 0 },
      uAspect: { value: 1 }, uField: { value: this.field }, uSeeds: { value: initial },
    });
    const error = this.compute.init();
    if (error) throw new Error(error);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const refs = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) { refs[i * 2] = ((i % side) + .5) / side; refs[i * 2 + 1] = (Math.floor(i / side) + .5) / side; }
    geometry.setAttribute('reference', new THREE.BufferAttribute(refs, 2));
    const material = new THREE.ShaderMaterial({ vertexShader: particleVertex, fragmentShader: particleFragment,
      uniforms: { uPositions: { value: null }, uSize: { value: 2 }, uPixelRatio: { value: this.renderer.getPixelRatio() }, uColor: { value: new THREE.Color() }, uAccent: { value: new THREE.Color() } },
      transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
    this.points = new THREE.Points(geometry, material); this.points.frustumCulled = false; this.scene.add(this.points);
    this.clearTrails();
  }
  clearTrails() {
    for (const target of this.targets) { this.renderer.setRenderTarget(target); this.renderer.clear(); }
    this.renderer.setRenderTarget(null);
  }
  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.targets.forEach(t => t.setSize(size.x, size.y)); this.clearTrails();
  }
  update(time: number, dt: number) {
    const c = this.config, u = this.variable.material.uniforms;
    u.uTime.value = time; u.uDt.value = dt; u.uSpeed.value = c.speed; u.uNoise.value = c.noise;
    u.uWaveAmplitude.value = c.waveAmplitude; u.uWaveLength.value = c.waveLength; u.uWaveSpeed.value = c.waveSpeed;
    u.uAspect.value = innerWidth / innerHeight;
    this.compute.compute();
    const p = this.points.material.uniforms;
    p.uPositions.value = this.compute.getCurrentRenderTarget(this.variable).texture;
    p.uSize.value = c.size; p.uColor.value.set(c.color); p.uAccent.value.set(c.accent);
    const next = 1 - this.active;
    this.fade.uniforms.uPrevious.value = this.targets[this.active].texture;
    this.fade.uniforms.uDecay.value = Math.pow(c.trails, dt * 60);
    this.quad.material = this.fade;
    this.renderer.setRenderTarget(this.targets[next]);
    this.renderer.render(this.quadScene, this.camera);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.display.uniforms.uPrevious.value = this.targets[next].texture;
    this.quad.material = this.display;
    this.renderer.render(this.quadScene, this.camera);
    this.active = next;
  }
  dispose() {
    this.compute.dispose(); this.points.geometry.dispose(); this.points.material.dispose();
    this.targets.forEach(t => t.dispose()); this.quad.geometry.dispose(); this.fade.dispose(); this.display.dispose(); this.renderer.dispose();
  }
}
