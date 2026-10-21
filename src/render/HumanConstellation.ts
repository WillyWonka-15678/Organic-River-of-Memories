import * as THREE from 'three';
import type { RiverConfig } from '../config';
import { PoseTrack, STAR_NODES, CONSTELLATION_LINKS } from '../interaction/PoseTrack';
import { easingAlpha } from '../interaction/field';
import { flowFunctions } from './organicShaders';

const vertex=/* glsl */`
uniform float uPixelRatio;
attribute float starSize,starAlpha;attribute vec3 starColor;
varying float vAlpha;varying vec3 vColor;
void main(){vAlpha=starAlpha;vColor=starColor;gl_Position=vec4(position.xy*2.-1.,0.,1.);gl_PointSize=starSize*uPixelRatio;}`;
const starFragment=/* glsl */`
varying float vAlpha;varying vec3 vColor;
void main(){float r=length((gl_PointCoord-.5)*2.);if(r>1.)discard;
float glow=exp(-r*r*26.)+exp(-r*r*3.8)*.19*(1.-smoothstep(.65,1.,r));
gl_FragColor=vec4(vColor,glow*vAlpha*1.45);
#include <colorspace_fragment>
}`;
const lineVertex=/* glsl */`
attribute float lineAlpha,side;varying float vAlpha,vSide;
void main(){vAlpha=lineAlpha;vSide=side;gl_Position=vec4(position.xy*2.-1.,0.,1.);}`;
const lineFragment=/* glsl */`
varying float vAlpha,vSide;
void main(){float feather=exp(-vSide*vSide*3.)*(1.-smoothstep(.65,1.,abs(vSide)));
gl_FragColor=vec4(vec3(.50,.78,.82),vAlpha*feather);
#include <colorspace_fragment>
}`;
const dustVertex=/* glsl */`
uniform float uTime,uAspect,uPixelRatio;
attribute float born,life,dustSeed;varying float vAlpha;varying vec3 vColor;
${flowFunctions}
void main(){float age=uTime-born;float f=clamp(age/life,0.,1.);
float x=position.x+age*(.045+.025*dustSeed)/uAspect;
float g=0.,nearest=10.;for(int i=0;i<4;i++){float d=abs(position.y-spine(position.x,float(i),uTime));if(d<nearest){nearest=d;g=float(i);}}
float y=mix(position.y,spine(x,g,uTime),1.-exp(-max(age,0.)*.45));
y+=sin(age*1.6+dustSeed*31.)*.009*f;
vAlpha=step(0.,age)*smoothstep(0.,.18,age)*pow(1.-f,2.)*.36;
vColor=mix(vec3(.43,.79,.78),vec3(.84,.67,.34),step(.91,dustSeed));
gl_Position=vec4(vec2(x,y)*2.-1.,0.,1.);gl_PointSize=(2.+dustSeed*2.)*uPixelRatio;}`;

type Trail={x:number;y:number;time:number;confidence:number};
export class HumanConstellation {
  readonly scene=new THREE.Scene();
  private starGeometry=new THREE.BufferGeometry();
  private starMaterial:THREE.ShaderMaterial;
  private stars:THREE.Points;
  private curveGeometry=new THREE.BufferGeometry();
  private curveMaterial:THREE.ShaderMaterial;
  private curves:THREE.Mesh;
  private dustGeometry=new THREE.BufferGeometry();
  private dustMaterial:THREE.ShaderMaterial;
  private dust:THREE.Points;
  private positions=new Float32Array(1500*3);
  private alphas=new Float32Array(1500);
  private sizes=new Float32Array(1500);
  private colors=new Float32Array(1500*3);
  private curvePositions=new Float32Array(CONSTELLATION_LINKS.length*24*6*3);
  private curveAlphas=new Float32Array(CONSTELLATION_LINKS.length*24*6);
  private curveSides=new Float32Array(CONSTELLATION_LINKS.length*24*6);
  private bends=new Float32Array(CONSTELLATION_LINKS.length);
  private history:Trail[][]=STAR_NODES.map(()=>[]);
  private dustPositions=new Float32Array(384*3);
  private dustBorn=new Float32Array(384).fill(-1000);
  private dustLife=Float32Array.from({length:384},()=>2.5+Math.random()*2.);
  private dustSeeds=Float32Array.from({length:384},()=>Math.random());
  private dustCursor=0;
  private emissions=0;
  private lastHistory=-Infinity;
  private previousTime=0;
  private count=0;
  constructor(pixelRatio:number){
    const dynamic=(array:Float32Array,size:number)=>new THREE.BufferAttribute(array,size).setUsage(THREE.DynamicDrawUsage);
    this.starGeometry.setAttribute('position',dynamic(this.positions,3));
    this.starGeometry.setAttribute('starAlpha',dynamic(this.alphas,1));this.starGeometry.setAttribute('starSize',dynamic(this.sizes,1));this.starGeometry.setAttribute('starColor',dynamic(this.colors,3));
    this.starMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:starFragment,uniforms:{uPixelRatio:{value:pixelRatio}},transparent:true,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false});
    this.stars=new THREE.Points(this.starGeometry,this.starMaterial);this.stars.frustumCulled=false;
    this.curveGeometry.setAttribute('position',dynamic(this.curvePositions,3));this.curveGeometry.setAttribute('lineAlpha',dynamic(this.curveAlphas,1));this.curveGeometry.setAttribute('side',dynamic(this.curveSides,1));
    this.curveMaterial=new THREE.ShaderMaterial({vertexShader:lineVertex,fragmentShader:lineFragment,transparent:true,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,depthTest:false,depthWrite:false});
    this.curves=new THREE.Mesh(this.curveGeometry,this.curveMaterial);this.curves.frustumCulled=false;
    this.dustGeometry.setAttribute('position',dynamic(this.dustPositions,3));this.dustGeometry.setAttribute('born',dynamic(this.dustBorn,1));
    this.dustGeometry.setAttribute('life',new THREE.BufferAttribute(this.dustLife,1));this.dustGeometry.setAttribute('dustSeed',new THREE.BufferAttribute(this.dustSeeds,1));
    this.dustMaterial=new THREE.ShaderMaterial({vertexShader:dustVertex,fragmentShader:starFragment,uniforms:{uTime:{value:0},uAspect:{value:1},uPixelRatio:{value:pixelRatio}},transparent:true,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false});
    this.dust=new THREE.Points(this.dustGeometry,this.dustMaterial);this.dust.frustumCulled=false;
    this.scene.add(this.curves,this.dust,this.stars);
  }
  private star(x:number,y:number,size:number,alpha:number,gold:boolean){
    const n=this.count++;if(n>=1500)return;
    this.positions[n*3]=x;this.positions[n*3+1]=y;this.sizes[n]=size;this.alphas[n]=alpha;
    this.colors.set(gold?[.88,.69,.36]:[.65,.89,.93],n*3);
  }
  update(track:PoseTrack,time:number,dt:number,aspect:number,config:RiverConfig){
    const enabled=config.constellation&&config.stage>=2;
    this.scene.visible=enabled;
    if(time<this.previousTime){this.history=STAR_NODES.map(()=>[]);this.dustBorn.fill(-1000);this.lastHistory=-Infinity;}
    this.previousTime=time;this.count=0;
    const sample=time-this.lastHistory>1/24;
    if(sample)this.lastHistory=time;
    const form=track.formation;
    STAR_NODES.forEach((index,k)=>{
      const j=track.joints[index],gold=index===15||index===24;
      const weight=index===0?1.3:[15,16,11,12,23,24].includes(index)?1.15:[7,8,31,32,33,34,35].includes(index)?.60:.88;
      const breathe=.9+.1*Math.sin(time*.85+index*.61);
      const alpha=j.confidence*form*config.nodeBrightness*breathe;
      this.star(j.x,j.y,config.nodeSize*weight*3.,alpha,gold);
      const history=this.history[k];
      if(sample&&alpha>.04)history.push({x:j.x,y:j.y,time,confidence:j.confidence});
      while(history.length>60||history.length&&time-history[0].time>config.constellationTrails)history.shift();
      for(const old of history){
        const age=(time-old.time)/Math.max(.01,config.constellationTrails);
        this.star(old.x,old.y,config.nodeSize*weight*2.1,old.confidence*form*config.nodeBrightness*(1-age)**2*.22,gold);
      }
    });
    this.starGeometry.setDrawRange(0,Math.min(1500,this.count));
    for(const key of ['position','starAlpha','starSize','starColor'])this.starGeometry.getAttribute(key).needsUpdate=true;
    let v=0;
    CONSTELLATION_LINKS.forEach(([a,b],edge)=>{
      const p=track.joints[a],q=track.joints[b];
      const dx=(q.x-p.x)*aspect,dy=q.y-p.y,length=Math.hypot(dx,dy);
      const nx=-dy/Math.max(.001,length),ny=dx/Math.max(.001,length);
      const lag=Math.max(-.008,Math.min(.008,((p.vx+q.vx)*aspect*nx+(p.vy+q.vy)*ny)*config.poseSmoothing*.035));
      this.bends[edge]+=(lag-this.bends[edge])*easingAlpha(dt,.18);
      const bend=this.bends[edge]+Math.sin(time*.65+edge*1.7)*.0018;
      const cx=(p.x+q.x)*.5+nx*bend/aspect,cy=(p.y+q.y)*.5+ny*bend;
      const alpha=length>.65||length<.002?0:Math.min(p.confidence,q.confidence)*form*config.connectionOpacity;
      const point=(t:number,side:number)=>{
        const x=(1-t)**2*p.x+2*(1-t)*t*cx+t*t*q.x,y=(1-t)**2*p.y+2*(1-t)*t*cy+t*t*q.y;
        const tx=2*((1-t)*(cx-p.x)+t*(q.x-cx))*aspect,ty=2*((1-t)*(cy-p.y)+t*(q.y-cy));
        const l=Math.max(.001,Math.hypot(tx,ty)),width=1.65/innerHeight;
        this.curvePositions[v*3]=x-ty/l*width*side/aspect;this.curvePositions[v*3+1]=y+tx/l*width*side;
        this.curveAlphas[v]=alpha*(.9+.1*Math.sin(time*.5+edge));this.curveSides[v]=side;v++;
      };
      for(let i=0;i<24;i++){const t=i/24,t1=(i+1)/24;point(t,-1);point(t,1);point(t1,-1);point(t1,-1);point(t,1);point(t1,1);}
    });
    for(const key of ['position','lineAlpha','side'])this.curveGeometry.getAttribute(key).needsUpdate=true;
    const possible=STAR_NODES.filter(i=>track.joints[i].confidence>.3);
    this.emissions+=enabled?track.presence*(1-form)*80*dt:0;
    while(this.emissions>=1&&possible.length){
      this.emissions--;const joint=track.joints[possible[Math.floor(Math.random()*possible.length)]],i=this.dustCursor++%384;
      this.dustPositions[i*3]=joint.x;this.dustPositions[i*3+1]=joint.y;this.dustBorn[i]=time;
    }
    this.emissions=Math.min(1,this.emissions);
    this.dustGeometry.getAttribute('position').needsUpdate=true;this.dustGeometry.getAttribute('born').needsUpdate=true;
    this.dustMaterial.uniforms.uTime.value=time;this.dustMaterial.uniforms.uAspect.value=aspect;
  }
  dispose(){for(const geometry of [this.starGeometry,this.curveGeometry,this.dustGeometry])geometry.dispose();for(const material of [this.starMaterial,this.curveMaterial,this.dustMaterial])material.dispose();}
}
