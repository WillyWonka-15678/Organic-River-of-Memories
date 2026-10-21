import * as THREE from 'three';
import { easingAlpha } from './field';
import type { BodyInput } from './BodyInput';

export class PresenceField {
  data: Float32Array;
  texture: THREE.DataTexture;
  presence = 0;
  constructor(readonly width: number, readonly height: number) {
    this.data = new Float32Array(width * height * 4);
    for (let i = 0; i < this.data.length; i += 4) this.data[i] = 2;
    this.texture = new THREE.DataTexture(this.data, width, height, THREE.RGBAFormat, THREE.FloatType);
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
  }
  update(body: BodyInput, active: boolean, dt: number, recovery: number) {
    const present = active && body.coverage > .003;
    this.presence += ((present ? 1 : 0) - this.presence) * easingAlpha(dt, present ? .85 : recovery);
    const attack = easingAlpha(dt, .24), release = easingAlpha(dt, recovery);
    const wake = Math.exp(-Math.max(0, performance.now() - body.lastMaskTime - 100) / 700);
    for (let i = 0; i < this.width * this.height; i++) {
      const j = i * 4, target = active ? body.target[i] : 2;
      const delta = target - this.data[j];
      this.data[j] += delta < 0 ? delta * attack : Math.min(delta, .22) * release;
      for (let axis = 0; axis < 2; axis++) {
        const desired = active ? body.motion[i * 2 + axis] * wake : 0;
        const k = j + 1 + axis;
        this.data[k] += (desired - this.data[k]) * easingAlpha(dt, Math.abs(desired) > Math.abs(this.data[k]) ? .12 : .9);
      }
      this.data[j + 3] += ((active ? body.mask[i] / 255 : 0) - this.data[j + 3]) * attack;
    }
    this.texture.needsUpdate = true;
  }
}
