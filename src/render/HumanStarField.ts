import * as THREE from 'three';
import type { RiverConfig } from '../config';

const common=/* glsl */`
uniform sampler2D uBody;
uniform float uTime,uAspect,uPresence,uFormation,uDensity,uWeave,uAura;
float body(vec2 p){vec4 field=texture2D(uBody,clamp(p,0.,1.));return min(1.-smoothstep(-.004,.005,field.r),field.a)*uPresence;}
vec2 breathe(vec2 p){return p+vec2(sin(uTime*.33+p.y*17.),cos(uTime*.27+p.x*19.))*vec2(.0017/uAspect,.0017);}
`;
const dustVertex=/* glsl */`
${common}
uniform float uPixelRatio;attribute vec4 seed;
varying float vAlpha,vWarm,vBeacon;
void main(){
  vec2 p=position.xy;
  p+=vec2(sin(uTime*.21+seed.x*31.)*.0035/uAspect,cos(uTime*.19+seed.y*29.)*.0035);
  float mask=body(p);
  float ripple=.68+.32*sin(uTime*.6+seed.z*30.+p.y*9.);
  float occupied=step(seed.w,uDensity);
  vBeacon=step(.975,seed.z);
  float depth=.25+.75*seed.y;
  float gain=(.22+.78*uFormation);
  vAlpha=mask*occupied*ripple*gain*mix(.55,1.15,vBeacon)*depth;
  vWarm=step(.945,seed.x);
  gl_Position=vec4(p*2.-1.,0.,1.);
  gl_PointSize=uPixelRatio*mix(1.6+seed.z*2.5,11.+seed.x*12.,vBeacon);
}`;
const dustFragment=/* glsl */`
varying float vAlpha,vWarm,vBeacon;
void main(){float r=length((gl_PointCoord-.5)*2.);if(r>1.)discard;
float glow=mix(exp(-r*r*3.),exp(-r*r*30.)+exp(-r*r*4.)*.16,vBeacon)*(1.-smoothstep(.7,1.,r));
vec3 color=mix(vec3(.28,.72,.83),vec3(.85,.68,.36),vWarm);
gl_FragColor=vec4(color,glow*vAlpha);
#include <colorspace_fragment>
}`;
const webVertex=/* glsl */`
${common}
uniform float uHeight;attribute vec2 endA,endB;attribute float along,side,webSeed;
varying vec2 vScreen;varying float vAlpha,vSide,vWarm;
void main(){
  vec2 a=breathe(endA),b=breathe(endB);
  vec2 middle=(a+b)*.5;
  // Reject an entire edge if its endpoints or middle cross a silhouette gap.
  float mask=min(body(a),min(body(b),body(middle)));
  float intact=smoothstep(.25,.8,mask);
  vec2 direction=(b-a)*vec2(uAspect,1.);
  vec2 normal=vec2(-direction.y,direction.x)/max(length(direction),.0001);
  vec2 p=mix(a,b,along)+normal*side*1.05/uHeight/vec2(uAspect,1.);
  vScreen=p;vSide=side;
  float shimmer=.5+.5*sin(webSeed*41.+uTime*.22);
  vAlpha=intact*uWeave*(.08+.92*uFormation)*(.26+.35*shimmer);
  vWarm=step(.96,webSeed);
  gl_Position=vec4(p*2.-1.,0.,1.);
}`;
const webFragment=/* glsl */`
${common}
varying vec2 vScreen;varying float vAlpha,vSide,vWarm;
void main(){float feather=exp(-vSide*vSide*2.3)*(1.-smoothstep(.7,1.,abs(vSide)));
vec3 color=mix(vec3(.25,.64,.76),vec3(.75,.58,.31),vWarm);
gl_FragColor=vec4(color,vAlpha*feather*body(vScreen));
#include <colorspace_fragment>
}`;
const auraVertex=`varying vec2 vScreen;void main(){vScreen=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const auraFragment=/* glsl */`
${common}
varying vec2 vScreen;
void main(){float d=texture2D(uBody,vScreen).r;
float edge=exp(-abs(d)/.008),halo=exp(-abs(d)/.030);
float interior=1.-smoothstep(-.025,.004,d);
float grain=.83+.17*sin(vScreen.y*33.+uTime*.35)*sin(vScreen.x*31.-uTime*.2);
float gain=(.18+.82*uFormation)*uPresence*uAura;
float alpha=(interior*.10*grain+edge*.20+halo*.035)*gain;
gl_FragColor=vec4(vec3(.10,.39,.51),alpha);
#include <colorspace_fragment>
}`;

/** Mask-derived material, independent of the limited number of pose landmarks. */
export class HumanStarField {
  readonly group=new THREE.Group();
  private materials:THREE.ShaderMaterial[]=[];
  private geometries:THREE.BufferGeometry[]=[];
  constructor(field:THREE.DataTexture,pixelRatio:number){
    const uniforms={uBody:{value:field},uTime:{value:0},uAspect:{value:1},uPresence:{value:0},uFormation:{value:0},uDensity:{value:.8},uWeave:{value:.65},uAura:{value:.7},uPixelRatio:{value:pixelRatio},uHeight:{value:1080}};
    const material=(vertexShader:string,fragmentShader:string)=>{
      const m=new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms,transparent:true,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false,side:THREE.DoubleSide});
      this.materials.push(m);return m;
    };
    const dust=new THREE.BufferGeometry(),count=22000;
    const positions=new Float32Array(count*3),seeds=new Float32Array(count*4);
    for(let i=0;i<count;i++){positions[i*3]=Math.random();positions[i*3+1]=Math.random();for(let j=0;j<4;j++)seeds[i*4+j]=Math.random();}
    dust.setAttribute('position',new THREE.BufferAttribute(positions,3));dust.setAttribute('seed',new THREE.BufferAttribute(seeds,4));
    const points=new THREE.Points(dust,material(dustVertex,dustFragment));points.frustumCulled=false;points.renderOrder=-1;this.group.add(points);this.geometries.push(dust);
    const aura=new THREE.PlaneGeometry(2,2);const veil=new THREE.Mesh(aura,material(auraVertex,auraFragment));veil.frustumCulled=false;veil.renderOrder=-3;this.group.add(veil);this.geometries.push(aura);

    // A jittered, staggered lattice gives local triangles without costly per-frame triangulation.
    // About one tenth of the former 78 × 46 mesh, with cells roughly 3× wider.
    const columns=25,rows=15,vertices:THREE.Vector2[]=[];
    for(let y=0;y<rows;y++)for(let x=0;x<columns;x++)vertices.push(new THREE.Vector2((x+.35+(y%2)*.35+(Math.random()-.5)*.65)/columns,(y+.5+(Math.random()-.5)*.65)/rows));
    const a:number[]=[],b:number[]=[],along:number[]=[],side:number[]=[],random:number[]=[];
    const edge=(p:THREE.Vector2,q:THREE.Vector2)=>{
      const r=Math.random();for(const [t,s] of [[0,-1],[0,1],[1,-1],[1,-1],[0,1],[1,1]]){a.push(p.x,p.y);b.push(q.x,q.y);along.push(t);side.push(s);random.push(r);}
    };
    for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
      const p=vertices[y*columns+x];if(x+1<columns)edge(p,vertices[y*columns+x+1]);
      if(y+1<rows){edge(p,vertices[(y+1)*columns+x]);const nx=x+(y%2?1:-1);if(nx>=0&&nx<columns)edge(p,vertices[(y+1)*columns+nx]);}
    }
    const web=new THREE.BufferGeometry();web.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(along.length*3),3));
    web.setAttribute('endA',new THREE.Float32BufferAttribute(a,2));web.setAttribute('endB',new THREE.Float32BufferAttribute(b,2));web.setAttribute('along',new THREE.Float32BufferAttribute(along,1));web.setAttribute('side',new THREE.Float32BufferAttribute(side,1));web.setAttribute('webSeed',new THREE.Float32BufferAttribute(random,1));
    const mesh=new THREE.Mesh(web,material(webVertex,webFragment));mesh.frustumCulled=false;mesh.renderOrder=-2;this.group.add(mesh);this.geometries.push(web);
  }
  update(time:number,aspect:number,presence:number,formation:number,config:RiverConfig){
    const u=this.materials[0].uniforms;u.uTime.value=time;u.uAspect.value=aspect;u.uPresence.value=presence;u.uFormation.value=formation;
    u.uDensity.value=config.bodyStarDensity;u.uWeave.value=config.bodyWeb;u.uAura.value=config.bodyAura;u.uHeight.value=innerHeight;
  }
  dispose(){this.materials.forEach(m=>m.dispose());this.geometries.forEach(g=>g.dispose());}
}
