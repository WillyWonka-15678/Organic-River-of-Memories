import type { RiverConfig } from '../config';
import type { PosePoint } from './PoseTrack';
import { riverSpine } from './riverSpine';
export const MAX_WAKES=6;
export interface MotionSample {x:number;y:number;width:number;stamp:number;valid:boolean;source?:string}
export function torsoSample(points:PosePoint[],stamp:number,aspect:number):MotionSample {
  const good=(i:number)=>{const p=points[i];return p&&p.confidence>=.65&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;};
  const shoulders=good(11)&&good(12),hips=good(23)&&good(24);
  const ids=shoulders?(hips?[11,12,23,24]:[11,12]):hips?[23,24]:[];
  if(!ids.length)return {x:0,y:0,width:0,stamp,valid:false};
  const torso=ids.map(i=>points[i]);
  return {x:torso.reduce((s,p)=>s+p.x,0)/ids.length,y:torso.reduce((s,p)=>s+p.y,0)/ids.length,width:Math.hypot((torso[0].x-torso[1].x)*aspect,torso[0].y-torso[1].y),stamp,valid:true,source:shoulders?(hips?'torso':'shoulders'):'hips'};
}
// Prefer the ear midpoint over the nose, which shifts during a head turn.
export function headSample(points:PosePoint[],stamp:number,aspect:number):MotionSample {
  const good=(i:number)=>{const p=points[i];return p&&p.confidence>=.65&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;};
  const ids=good(7)&&good(8)?[7,8]:good(2)&&good(5)?[2,5]:good(0)?[0]:[];
  if(!ids.length)return {x:0,y:0,width:0,stamp,valid:false,source:'head'};
  const p=ids.map(i=>points[i]);
  const width=p.length===2?Math.hypot((p[0].x-p[1].x)*aspect,p[0].y-p[1].y)*(ids[0]===2?1.8:1):.08;
  return {x:p.reduce((v,q)=>v+q.x,0)/p.length,y:p.reduce((v,q)=>v+q.y,0)/p.length,width:Math.max(.045,Math.min(.18,width)),stamp,valid:true,source:`head-${ids.join('-')}`};
}
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const ease=(dt:number,t:number)=>1-Math.exp(-dt/Math.max(.01,t));
// Screen-height units keep horizontal speed and radii independent of aspect ratio.
export class BodyMotion {
  x=0;y=0;width=.15;vx=0;vy=0;moving=false;valid=false;
  private last=-1;private rawX=0;private rawY=0;private quiet=0;private source?:string;
  reset(){this.last=-1;this.valid=false;this.moving=false;this.vx=this.vy=0;this.quiet=0;}
  sample(p:MotionSample,now:number,aspect:number,threshold:number,smoothing:number){
    if(!p.valid||now-p.stamp>.35||p.stamp>now+.05){this.reset();return;}
    if(p.stamp===this.last)return;
    const dt=p.stamp-this.last;
    if(this.last<0||p.source!==this.source||dt>.35||dt<=0||Math.hypot((p.x-this.rawX)*aspect,p.y-this.rawY)/dt>1.2){
      this.reset();this.x=p.x;this.y=p.y;this.width=p.width;
      this.source=p.source;this.last=p.stamp;this.rawX=p.x;this.rawY=p.y;return;
    }
    const rawSpeed=Math.abs((p.x-this.rawX)*aspect/dt);
    this.quiet=rawSpeed<threshold*.45?this.quiet+dt:0;
    const a=ease(dt,smoothing),oldX=this.x,oldY=this.y;
    this.x+=(p.x-this.x)*a;this.y+=(p.y-this.y)*a;this.width+=(p.width-this.width)*a;
    this.vx+=(((this.x-oldX)*aspect/dt)-this.vx)*ease(dt,.16);
    this.vy+=(((this.y-oldY)/dt)-this.vy)*ease(dt,.16);
    this.moving=this.quiet<.18&&Math.abs(this.vx)>(this.moving?threshold*.55:threshold);
    this.valid=true;this.last=p.stamp;this.rawX=p.x;this.rawY=p.y;
  }
}

// Low-frequency local river velocity; smoothly blended, never nearest-stream snapping.
export function riverVelocity(x:number,y:number,t:number,speed:number,aspect:number){
  let total=0,vx=0,vy=0;
  for(let g=0;g<4;g++){
    const d=y-riverSpine(x,g,t),w=Math.exp(-d*d/.018)+.001;
    const slope=(riverSpine(x+.003,g,t)-riverSpine(x-.003,g,t))/(.006*aspect);
    const u=speed*.93;vx+=w*u;vy+=w*u*slope;total+=w;
  }
  return {x:vx/total,y:clamp(vy/total,-.20,.20)};
}
export interface Wake {x:number;y:number;age:number;life:number;radius:number;strength:number;direction:number;seed:number;expansion:number;dissipation:number;vx:number;vy:number}
export class BodyWake {
  readonly motion=new BodyMotion();
  readonly headMotion=new BodyMotion();
  readonly wakes:(Wake|null)[]=Array.from({length:MAX_WAKES},()=>null);
  spawned=0;private clock=0;private lastAnySpawn=-100;
  private trails=Array.from({length:2},()=>({lastSpawn:-100,lastX:0,lastY:0,hadTrail:false}));
  constructor(private random= Math.random){}
  clear(){this.wakes.fill(null);this.motion.reset();this.headMotion.reset();this.lastAnySpawn=-100;this.trails.forEach(t=>{t.hadTrail=false;t.lastSpawn=-100;});}
  update(dt:number,time:number,aspect:number,c:RiverConfig){
    if(!c.wakeEnabled||c.wakeMode==='off'){this.clear();return;}
    this.clock+=dt;
    // Substeps avoid frame-rate-dependent centre advection on a slower display.
    const steps=Math.max(1,Math.min(64,Math.ceil(dt/.025))),h=dt/steps;
    for(let k=0;k<steps;k++)for(let i=0;i<MAX_WAKES;i++){
      const w=this.wakes[i];if(!w)continue;w.age+=h;
      if(w.age>=w.life){this.wakes[i]=null;continue;}
      const v=riverVelocity(w.x,w.y,time-dt+(k+1)*h,c.speed,aspect),a=ease(h,.7);
      w.vx+=(v.x*c.wakeAdvection-w.vx)*a;w.vy+=(v.y*c.wakeAdvection-w.vy)*a;
      w.x+=w.vx*h/aspect;w.y+=w.vy*h;
    }
    if(dt>.5){this.motion.reset();this.headMotion.reset();this.trails.forEach(t=>t.hadTrail=false);return;}
    if(this.clock-this.lastAnySpawn<.65)return;
    // Both emitters share the same bounded pool; favour the one waiting longest.
    const candidates=[0,1].sort((a,b)=>this.trails[a].lastSpawn-this.trails[b].lastSpawn);
    for(const index of candidates)if(this.emit(index,time,aspect,c))break;
  }
  private emit(index:number,time:number,aspect:number,c:RiverConfig){
    const head=index===1,m=head?this.headMotion:this.motion,trail=this.trails[index];
    if(!m.valid||!m.moving){if(!m.valid)trail.hadTrail=false;return false;}
    const speed=Math.abs(m.vx),gap=Math.max(.65,c.wakeInterval*(head?1.35:1)/(1+speed*.9));
    if(this.clock-trail.lastSpawn<gap)return false;
    if(trail.hadTrail&&Math.hypot((m.x-trail.lastX)*aspect,m.y-trail.lastY)<c.wakeSpacing*(head?.7:1))return false;
    if(this.wakes.filter(Boolean).length>=Math.floor(c.wakeMaximum))return false;
    const radius=clamp(c.wakeRadius*(head?.65:1),.025,.16),seed=this.random();
    const direction=c.wakeDirection==='clockwise'?-1:c.wakeDirection==='counterclockwise'?1:c.wakeDirection==='random'?(seed>.5?1:-1):(this.spawned%2?1:-1);
    const x=m.x-Math.sign(m.vx)*(clamp(m.width,head?.045:.08,head?.18:.38)*.52+radius*.28)/aspect;
    const y=m.y+direction*radius*(.32+seed*.25);
    if(this.wakes.some(w=>w&&w.age<w.life*.65&&Math.hypot((x-w.x)*aspect,y-w.y)<(radius+w.radius)*.72))return false;
    const v=riverVelocity(x,y,time,c.speed,aspect);
    const slot=this.wakes.indexOf(null);if(slot<0)return false;
    this.wakes[slot]={x,y,age:0,life:c.wakeLifetime*(.92+seed*.16),radius:radius*(.88+seed*.12),strength:clamp(c.wakeRotation*(head?.55:1),0,.12),direction,seed,expansion:c.wakeExpansion,dissipation:c.wakeDissipation,vx:v.x*c.wakeAdvection,vy:v.y*c.wakeAdvection};
    this.spawned++;trail.lastSpawn=this.clock;trail.lastX=m.x;trail.lastY=m.y;trail.hadTrail=true;this.lastAnySpawn=this.clock;
    return true;
  }
}
