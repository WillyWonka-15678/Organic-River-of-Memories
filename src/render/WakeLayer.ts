import { paletteGLSL } from './ColorSystem';
import * as THREE from 'three';
import { type BodyWake, riverVelocity } from '../interaction/BodyWake';
import type { RiverConfig } from '../config';
import { transportParcel, wakeUniforms, updateWakeUniforms } from './wakeField';

// Streaklines: every vertex is an independently transported parcel of river water.
// Neighbours share an emitter, not an angle/radius or a prescribed spiral path.
const LANES=32,ROWS=220,STEP=.055;
export class WakeLayer {
  readonly scene=new THREE.Scene();
  private geometry=new THREE.BufferGeometry();
  private material:THREE.ShaderMaterial;
  private positions=new Float32Array(ROWS*LANES*6);
  private alphas=new Float32Array(ROWS*LANES*2);
  private parcels=Array.from({length:ROWS},()=>({age:100,life:10,serial:-1,points:new Float32Array(LANES*4)}));
  private cursor=0;private serial=0;private emitClock=0;private previousX=0;private previousY=0;private emitting=false;
  private uniforms=wakeUniforms();
  constructor(_pixelRatio:number){
    this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('opacity',new THREE.BufferAttribute(this.alphas,1).setUsage(THREE.DynamicDrawUsage));
    this.material=new THREE.ShaderMaterial({
      vertexShader:`attribute float opacity;varying float vAlpha;varying vec2 vPalettePosition;void main(){vPalettePosition=position.xy;vAlpha=opacity;gl_Position=vec4(position.xy*2.-1.,0.,1.);}`,
      fragmentShader:`${paletteGLSL}
uniform float uAspect;varying float vAlpha;varying vec2 vPalettePosition;void main(){vec3 c=riverPalette(vec3(.20,.72,.65),vPalettePosition,uAspect,.6,0.,0.,.1);gl_FragColor=vec4(c,vAlpha);\n#include <colorspace_fragment>\n}`,
      uniforms:{uAspect:{value:1}},transparent:true,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false});
    const lines=new THREE.LineSegments(this.geometry,this.material);lines.frustumCulled=false;this.scene.add(lines);
  }
  update(wake:BodyWake,aspect:number,c:RiverConfig,dt:number,time:number){
    this.material.uniforms.uAspect.value=aspect;
    updateWakeUniforms(this.uniforms,wake);
    const active=c.wakeEnabled&&c.wakeMode!=='off';
    if(!active){this.parcels.forEach(p=>p.age=100);this.emitting=false;this.geometry.setDrawRange(0,0);return;}
    this.emitClock+=dt;
    const m=wake.motion.valid&&wake.motion.moving?wake.motion:wake.headMotion;
    const emitterRadius=c.wakeRadius*(m===wake.headMotion?.65:1);
    if(m.valid&&m.moving){
      // Continuous narrow sheets released behind the moving torso, across the shear layer.
      const x=m.x-Math.sign(m.vx)*Math.max(.06,m.width*.45)/aspect,y=m.y;
      if(!this.emitting||Math.hypot((x-this.previousX)*aspect,y-this.previousY)>.12){this.serial++;this.previousX=x;this.previousY=y;this.emitClock=STEP;}
      while(this.emitClock>=STEP){
        this.emitClock-=STEP;
        const row=this.parcels[this.cursor];row.age=0;row.life=c.wakeLifetime;row.serial=this.serial++;
        for(let j=0;j<LANES;j++){
          const q=(j/(LANES-1)-.5)*2;
          row.points[j*4]=x;row.points[j*4+1]=y+q*emitterRadius*.9;
          const v=riverVelocity(x,row.points[j*4+1],time,c.speed,aspect);
          row.points[j*4+2]=v.x;row.points[j*4+3]=v.y;
        }
        this.cursor=(this.cursor+1)%ROWS;
      }
      this.previousX=x;this.previousY=y;this.emitting=true;
    }else{this.emitting=false;this.emitClock=0;}
    for(const row of this.parcels){
      if(row.age>=row.life)continue;
      row.age+=dt;
      for(let j=0;j<LANES;j++)transportParcel(row.points,j*4,dt,time,aspect,c.speed,this.uniforms.uWakeCentre.value);
    }
    let n=0;
    for(let i=0;i<ROWS;i++){
      const row=this.parcels[i],prev=this.parcels[(i+ROWS-1)%ROWS];
      if(row.age>=row.life||prev.age>=prev.life||row.serial!==prev.serial+1)continue;
      const fade=Math.min(1,row.age/.5)*Math.pow(Math.max(0,1-row.age/row.life),1.4);
      for(let j=0;j<LANES;j++){
        if(j/LANES>c.wakeDensity)continue;
        const a=row.points,b=prev.points,o=j*4;
        if(Math.hypot((a[o]-b[o])*aspect,a[o+1]-b[o+1])>.08)continue;
        this.positions.set([a[o],a[o+1],0,b[o],b[o+1],0],n*6);
        this.alphas[n*2]=this.alphas[n*2+1]=fade*(.12+.09*Math.sin(j*2.7)**2);
        n++;
      }
    }
    this.geometry.setDrawRange(0,n*2);
    this.geometry.attributes.position.needsUpdate=true;this.geometry.attributes.opacity.needsUpdate=true;
  }
  setColorUniforms(uniforms:Record<string,THREE.IUniform>){Object.assign(this.material.uniforms,uniforms);}
  dispose(){this.geometry.dispose();this.material.dispose();}
}
