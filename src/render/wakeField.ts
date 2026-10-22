import * as THREE from 'three';
import { riverVelocity, type BodyWake } from '../interaction/BodyWake';

// Compact smooth vortex kernels are velocity sources, never rendered geometry.
// CPU tracers and GPU river particles use this same bounded tangential field.
export function wakeUniforms(){return {uWakeCentre:{value:Array.from({length:6},()=>new THREE.Vector4())}};}
export function updateWakeUniforms(u:ReturnType<typeof wakeUniforms>,wake:BodyWake){
  for(let i=0;i<6;i++){
    const w=wake.wakes[i];
    if(!w){u.uWakeCentre.value[i].set(0,0,0,0);continue;}
    const f=w.age/w.life;
    const smooth=(x:number)=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
    const strength=w.strength*smooth(w.age/1.1)*Math.pow(1-smooth((f-.35)/.65),w.dissipation);
    u.uWakeCentre.value[i].set(w.x,w.y,Math.min(.20,w.radius*(1+w.expansion*w.age)),strength*w.direction);
  }
}
export function sampleWake(x:number,y:number,aspect:number,centres:THREE.Vector4[]){
  let vx=0,vy=0,cover=0;
  for(const c of centres){
    if(c.z<=0)continue;
    const rx=(x-c.x)*aspect/c.z,ry=(y-c.y)/c.z,q=rx*rx+ry*ry;
    const fall=Math.exp(-q*1.5),a=c.w*2.85*fall;
    vx-=ry*a;vy+=rx*a;cover+=fall*Math.min(1,Math.abs(c.w)/.04);
  }
  // Smooth saturation, including when kernels overlap. No normalization at r=0.
  const scale=1/Math.sqrt(1+(vx*vx+vy*vy)/(.16*.16));
  return {x:vx*scale,y:vy*scale,cover:1-Math.exp(-cover)};
}
export const wakeGLSL=/*glsl*/`
uniform vec4 uWakeCentre[6];
vec3 wakeField(vec2 p,float aspect){
  vec2 v=vec2(0.);float cover=0.;
  for(int i=0;i<6;i++){
    vec4 c=uWakeCentre[i];
    if(c.z<=0.)continue;
    vec2 r=(p-c.xy)*vec2(aspect,1.)/c.z;
    float fall=exp(-dot(r,r)*1.5);
    v+=vec2(-r.y,r.x)*c.w*2.85*fall;
    cover+=fall*min(1.,abs(c.w)/.04);
  }
  v/=sqrt(1.+dot(v,v)/(.16*.16));
  return vec3(v,1.-exp(-cover));
}`;

/** Persistent material transport, using bounded substeps even on slower displays. */
export function transportParcel(p:Float32Array,o:number,dt:number,time:number,aspect:number,speed:number,centres:THREE.Vector4[]){
  const steps=Math.max(1,Math.ceil(dt/.0167)),h=dt/steps;
  for(let k=0;k<steps;k++){
    const x=p[o],y=p[o+1],b=riverVelocity(x,y,time-dt+(k+1)*h,speed,aspect),w=sampleWake(x,y,aspect,centres);
    const a=1-Math.exp(-h*6);
    p[o+2]+=(b.x*(1-w.cover*.5)+w.x-p[o+2])*a;
    p[o+3]+=(b.y*(1-w.cover*.5)+w.y-p[o+3])*a;
    p[o]+=p[o+2]*h/aspect;p[o+1]+=p[o+3]*h;
  }
}
