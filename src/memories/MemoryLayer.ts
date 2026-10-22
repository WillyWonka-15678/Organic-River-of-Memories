import { paletteGLSL } from '../render/ColorSystem';
import * as THREE from 'three';
import { flowFunctions } from '../render/organicShaders';
import { riverEvents } from '../integrations/events';
import { studyMemories, type MemoryRecord } from './MemoryRecord';

const vertex=/* glsl */`
uniform float uTime,uAspect,uPresence,uPixelRatio;
uniform sampler2D uField;
attribute vec2 glyph;
attribute vec4 memorySeed;
attribute float memoryIndex;
varying float vAlpha,vWarm;varying vec2 vPalettePosition;
${flowFunctions}
void main(){
  vec4 s=memorySeed;
  float phase=fract(uTime/36.+memoryIndex/3.+.18);
  float gather=smoothstep(.08,.27,phase)*(1.-smoothstep(.56,.78,phase));
  float visible=smoothstep(.01,.07,phase)*(1.-smoothstep(.88,.99,phase));
  float anchorX=.16+phase*.63+memoryIndex*.055;
  float group=mod(memoryIndex,3.);
  vec2 anchor=vec2(anchorX,spine(anchorX,group,uTime)+(group<.5?.058:-.058));
  vec2 target=anchor+glyph*vec2(1./uAspect,1.);
  target.y+=sin(glyph.x*12.+uTime*.15)*.002;
  float sourceX=fract(s.x+uTime*.023);
  vec2 source=vec2(sourceX,streamY(sourceX,s,uTime,1.));
  source+=vec2(s.y-.5,s.a-.5)*.11;
  vec2 p=mix(source,target,gather);
  float d=texture2D(uField,clamp(p,0.,1.)).r;
  vec2 e=vec2(.006,0.);
  vec2 n=vec2((texture2D(uField,p+e).r-texture2D(uField,p-e).r)/uAspect,texture2D(uField,p+e.yx).r-texture2D(uField,p-e.yx).r);
  n/=max(length(n),.00001);
  float feeling=exp(-abs(d)/.09)*uPresence;
  p=mix(p,source,feeling*.22);
  p+=n*.018*feeling/vec2(uAspect,1.);
  vAlpha=visible*(.025+.85*gather)*(.8+s.a*.2);
  vWarm=.55+.45*s.y;vPalettePosition=p;
  gl_Position=vec4(p*2.-1.,0.,1.);
  gl_PointSize=uPixelRatio*(1.+gather*1.7);
}`;
const fragment=/* glsl */`
${paletteGLSL}
uniform float uAspect;uniform vec3 uColor,uAccent;varying float vAlpha,vWarm;varying vec2 vPalettePosition;
void main(){float r=length((gl_PointCoord-.5)*2.);if(r>1.)discard;
vec3 color=mix(uColor,uAccent,vWarm);color=mix(color,vec3(.91,.93,.81),.17);
color=riverPalette(color,vPalettePosition,uAspect,0.,vWarm,0.,0.);
gl_FragColor=vec4(1.-exp(-color*1.35),exp(-r*r*2.)*vAlpha);
#include <colorspace_fragment>
}`;

export class MemoryLayer {
  points: THREE.Points<THREE.BufferGeometry,THREE.ShaderMaterial>;
  private records=[...studyMemories];
  private listener=(event:Event)=>{
    const detail=(event as CustomEvent<{id:string;text:string}>).detail;
    this.setRecords([...this.records.filter(r=>r.id!==detail.id),{id:detail.id,message:detail.text}].slice(-6));
  };
  private recordListener=(event:Event)=>{
    const record=(event as CustomEvent<MemoryRecord>).detail;
    this.setRecords([...this.records.filter(r=>r.id!==record.id),record].slice(-6));
  };
  constructor(field:THREE.DataTexture,pixelRatio:number){
    const material=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,
      uniforms:{uTime:{value:0},uAspect:{value:1},uPresence:{value:0},uPixelRatio:{value:pixelRatio},uField:{value:field},uColor:{value:new THREE.Color()},uAccent:{value:new THREE.Color()}},
      transparent:true,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false});
    this.points=new THREE.Points(new THREE.BufferGeometry(),material);this.points.frustumCulled=false;this.points.renderOrder=2;
    this.setRecords(this.records);riverEvents.addEventListener('text',this.listener);riverEvents.addEventListener('memory',this.recordListener);
  }
  setRecords(records:MemoryRecord[]){
    // The same contract can later be filled by a WebSocket/database adapter.
    this.records=records.slice(0,6);
    const glyph:number[]=[],seed:number[]=[],ids:number[]=[];
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=100;
    const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
    this.records.forEach((record,index)=>{
      ctx.clearRect(0,0,640,100);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font='400 28px "Microsoft YaHei", sans-serif';ctx.fillText(record.message.slice(0,24),320,39,580);
      ctx.font='400 11px "Microsoft YaHei", sans-serif';ctx.fillText([record.name,record.year,record.major].filter(Boolean).join('  ·  '),320,73,580);
      const pixels=ctx.getImageData(0,0,640,100).data;
      for(let y=5;y<95;y+=2)for(let x=10;x<630;x+=2)if(pixels[(y*640+x)*4+3]>100){
        glyph.push((x-320)*.00115,(50-y)*.00115);
        seed.push(Math.random(),Math.random(),Math.random()*.9,Math.random());ids.push(index);
      }
    });
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(ids.length*3),3));
    geometry.setAttribute('glyph',new THREE.Float32BufferAttribute(glyph,2));geometry.setAttribute('memorySeed',new THREE.Float32BufferAttribute(seed,4));geometry.setAttribute('memoryIndex',new THREE.Float32BufferAttribute(ids,1));
    this.points.geometry.dispose();this.points.geometry=geometry;
  }
  update(time:number,aspect:number,presence:number,color:string,accent:string){
    const u=this.points.material.uniforms;u.uTime.value=time;u.uAspect.value=aspect;u.uPresence.value=presence;u.uColor.value.set(color);u.uAccent.value.set(accent);
  }
  get count(){return this.points.geometry.getAttribute('position').count;}
  dispose(){riverEvents.removeEventListener('text',this.listener);riverEvents.removeEventListener('memory',this.recordListener);this.points.geometry.dispose();this.points.material.dispose();}
}
