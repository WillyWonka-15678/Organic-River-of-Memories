import { MemoryInteraction, memoryHands } from './MemoryInteraction';
import type { PoseTrack } from '../interaction/PoseTrack';
import type { RiverConfig } from '../config';
import { paletteGLSL } from '../render/ColorSystem';
import * as THREE from 'three';
import { flowFunctions } from '../render/organicShaders';
import type { MemoryRecord } from './MemoryRecord';
import { MemoryPool } from './MemoryPool';
import { MAX_MEMORY_INSTANCES } from './limits';

const vertex=/* glsl */`
uniform float uTime,uAspect,uPresence,uPixelRatio;
uniform sampler2D uField;
uniform vec4 uAnchors[${MAX_MEMORY_INSTANCES}],uMemoryState[${MAX_MEMORY_INSTANCES}];
attribute vec2 glyph;
attribute vec4 memorySeed;
attribute float memoryIndex;
attribute vec2 glyphDetail;
varying float vAlpha,vWarm,vFocus,vSpread;varying vec2 vPalettePosition;
${flowFunctions}
void main(){
  vec4 s=memorySeed;
  vec4 anchor=uAnchors[int(memoryIndex)],state=uMemoryState[int(memoryIndex)];
  float gather=smoothstep(0.,1.,state.x),release=smoothstep(.05,1.,state.y);
  float focus=smoothstep(0.,1.,state.z),textScale=mix(1.,3.,focus);
  vec2 p=anchor.xy+glyph*vec2(1./uAspect,1.)*textScale;
  vec2 summon=anchor.xy+vec2((s.x-.5)*.22/uAspect,(s.y-.5)*.12);
  p=mix(summon,p,gather);
  // Only a deliberate release unfolds the intact glyph into gentle flowing dust.
  float travel=state.y*state.y;
  float slope=(spine(anchor.x+.003,anchor.z,uTime)-spine(anchor.x-.003,anchor.z,uTime))/.006;
  p+=vec2(travel*(.10+s.x*.14)/uAspect,travel*(slope*.035+(s.y-.5)*.07));
  p+=release*vec2(sin(s.a*6.283+state.y*2.),cos(s.a*6.283+state.y*1.3))*.012;
  float visible=smoothstep(-.36,-.08,anchor.x)*(1.-smoothstep(1.05,1.30,anchor.x));
  vAlpha=anchor.w*visible*(.12+.73*gather)*(.8+s.a*.2)*(1.-smoothstep(.55,1.,state.y))*(1.+focus*.15);
  vAlpha*=glyphDetail.y;
  vFocus=focus*(1.-release)*mix(1.,.35,glyphDetail.x);vSpread=1.+2.*vFocus;
  vWarm=.55+.45*s.y;vPalettePosition=p;
  gl_Position=vec4(p*2.-1.,0.,1.);
  gl_PointSize=uPixelRatio*mix(mix(2.7,1.8,glyphDetail.x),1.4,release)*textScale*vSpread;
}`;
const fragment=/* glsl */`
${paletteGLSL}
uniform float uAspect;uniform vec3 uColor,uAccent;varying float vAlpha,vWarm,vFocus,vSpread;varying vec2 vPalettePosition;
void main(){float r=length((gl_PointCoord-.5)*2.);if(r>1.)discard;
vec3 color=mix(uColor,uAccent,vWarm);color=mix(color,vec3(.91,.93,.81),.17);
color=riverPalette(color,vPalettePosition,uAspect,0.,vWarm,0.,0.);
// A crisp scaled glyph core plus a broad low-energy halo, independent of global Bloom.
float coreR=r*vSpread;
float core=exp(-coreR*coreR*2.)*(1.-smoothstep(.9,1.,coreR));
float halo=exp(-r*r*5.)*(1.-smoothstep(.7,1.,r))*.12*vFocus;
gl_FragColor=vec4(1.-exp(-color*1.35*(1.+vFocus*.45)),(core+halo)*vAlpha);
#include <colorspace_fragment>
}`;

export class MemoryLayer {
  points: THREE.Points<THREE.BufferGeometry,THREE.ShaderMaterial>;
  readonly interaction=new MemoryInteraction();
  private signature='';
  private glyphCache=new Map<string,number[]>();
  private records:MemoryRecord[]=[];
  readonly pool=new MemoryPool((records,removed)=>{this.setRecords(records);for(const id of removed)this.interaction.removeRecord(id);});
  constructor(private field:THREE.DataTexture,pixelRatio:number){
    const material=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,
      uniforms:{uAnchors:{value:Array.from({length:MAX_MEMORY_INSTANCES},()=>new THREE.Vector4())},uMemoryState:{value:Array.from({length:MAX_MEMORY_INSTANCES},()=>new THREE.Vector4())},uTime:{value:0},uAspect:{value:1},uPresence:{value:0},uPixelRatio:{value:pixelRatio},uField:{value:field},uColor:{value:new THREE.Color()},uAccent:{value:new THREE.Color()}},
      transparent:true,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false});
    this.points=new THREE.Points(new THREE.BufferGeometry(),material);this.points.frustumCulled=false;this.points.renderOrder=2;
    this.interaction.nextPriority=()=>this.pool.take();
    this.interaction.priorityWaiting=()=>this.pool.queue.length>0;
  }
  setRecords(records:MemoryRecord[]){this.records=records.filter(r=>typeof r.message==='string'&&r.message.trim());}
  private rebuildGlyphs(){
    const items=this.interaction.items,signature=items.map(m=>m.id).join(',');
    if(signature===this.signature)return;this.signature=signature;
    const glyph:number[]=[],seed:number[]=[],ids:number[]=[],detail:number[]=[];
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=100;
    const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
    items.forEach((m,index)=>{
      const record=m.record,key=JSON.stringify(record);
      let samples=this.glyphCache.get(key);
      if(!samples){
        ctx.clearRect(0,0,640,100);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.font='400 28px "Microsoft YaHei", sans-serif';ctx.fillText(record.message,320,39,580);
        ctx.font='500 12px "Microsoft YaHei", sans-serif';ctx.fillText([record.name,record.year,record.major].filter(Boolean).join('  ·  '),320,77,580);
        const pixels=ctx.getImageData(0,0,640,100).data;samples=[];
        // Metadata uses every pixel and alpha coverage to retain small Chinese strokes.
        // The main message keeps its existing two-pixel grain.
        for(let y=5;y<95;y+=y<59?2:1)for(let x=10;x<630;x+=y<59?2:1){
          const alpha=pixels[(y*640+x)*4+3]/255;
          if(alpha>(y<59?100/255:.08))samples.push((x-320)*.00115,(50-y)*.00115,y<59?1:alpha*.9);
        }
        if(this.glyphCache.size>=64)this.glyphCache.delete(this.glyphCache.keys().next().value!);
        this.glyphCache.set(key,samples);
      }
      for(let j=0;j<samples.length;j+=3){
        glyph.push(samples[j],samples[j+1]);
        detail.push(samples[j+1]<-.009?1:0,samples[j+2]);
        // Stable grain prevents already held text from sparkling when another message spawns.
        const hash=(n:number)=>{const x=Math.sin(n*127.1+m.id*19.7)*43758.5453;return x-Math.floor(x);};
        seed.push(hash(j),hash(j+1),hash(j+2),hash(j+3));ids.push(index);
      }
    });
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(ids.length*3),3));
    geometry.setAttribute('glyph',new THREE.Float32BufferAttribute(glyph,2));geometry.setAttribute('memorySeed',new THREE.Float32BufferAttribute(seed,4));geometry.setAttribute('memoryIndex',new THREE.Float32BufferAttribute(ids,1));
    geometry.setAttribute('glyphDetail',new THREE.Float32BufferAttribute(detail,2));
    this.points.geometry.dispose();this.points.geometry=geometry;
  }
  update(time:number,dt:number,aspect:number,presence:number,pose:PoseTrack,c:RiverConfig){
    const hands=memoryHands(pose.joints,pose.presence,aspect);
    const data=this.field.image.data as Float32Array,w=this.field.image.width,h=this.field.image.height;
    const coverage=(x:number,y:number)=>{
      if(x<0||x>1||y<0||y>1||presence<.05)return 0;
      const px=x*(w-1),py=y*(h-1),ix=Math.floor(px),iy=Math.floor(py),fx=px-ix,fy=py-iy;
      const at=(a:number,b:number)=>data[(Math.min(h-1,b)*w+Math.min(w-1,a))*4+3];
      return ((at(ix,iy)*(1-fx)+at(ix+1,iy)*fx)*(1-fy)+(at(ix,iy+1)*(1-fx)+at(ix+1,iy+1)*fx)*fy);
    };
    this.interaction.update(dt,time,aspect,this.records,hands,coverage,c);this.rebuildGlyphs();
    const u=this.points.material.uniforms;
    this.interaction.items.forEach((m,i)=>{u.uAnchors.value[i].set(m.x,m.y,m.group,m.opacity);u.uMemoryState.value[i].set(m.formation,m.release,m.emphasis,0);});
    u.uTime.value=time;u.uAspect.value=aspect;u.uPresence.value=presence;u.uColor.value.set(c.color);u.uAccent.value.set(c.accent);
  }
  get count(){return this.points.geometry.getAttribute('position')?.count??0;}
  dispose(){this.points.geometry.dispose();this.points.material.dispose();}
}

