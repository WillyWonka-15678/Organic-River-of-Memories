import type { MemoryRecord } from './MemoryRecord';
import { riverSpine } from '../interaction/riverSpine';
export type MemoryState='FLOWING'|'BODY_SLOWED'|'CAPTURED'|'RELEASING';
export interface HandInput {x:number;y:number;shoulderX:number;shoulderY:number;scale:number;valid:boolean}
// Never derive shoulder width from an occluded shoulder's stale/default position.
export function memoryHands(joints:{x:number;y:number;confidence:number}[],presence:number,aspect:number):HandInput[]{
  const distance=(a:number,b:number)=>Math.hypot((joints[a].x-joints[b].x)*aspect,joints[a].y-joints[b].y);
  const shoulders=joints[11].confidence>.5&&joints[12].confidence>.5;
  return [0,1].map(i=>{
    const s=joints[11+i],e=joints[13+i],h=joints[15+i];
    const armScale=e.confidence>.5?.65*(distance(11+i,13+i)+distance(13+i,15+i)):.2;
    const scale=Math.max(.08,Math.min(.6,shoulders?distance(11,12):armScale));
    return {x:h.x,y:h.y,shoulderX:s.x,shoulderY:s.y,scale,valid:presence>.5&&h.confidence>.5&&s.confidence>.5};
  });
}
export interface MemorySettings {memoryCount:number;memoryInterval:number;memorySpeed:number;bodyTextSlowdown:number;captureRadius:number;captureHold:number;memoryReleaseTime:number}
export interface MemoryItem {id:number;record:MemoryRecord;x:number;y:number;speed:number;state:MemoryState;hand:number;age:number;formation:number;release:number;group:number;held:number;emphasis:number}
const ease=(dt:number,t:number)=>1-Math.exp(-dt/t);
export class MemoryGestures {
  hands=Array.from({length:2},()=>({x:0,y:0,ready:false,valid:false,dwell:0,lowered:0,armed:true,history:[] as {x:number;t:number}[],speed:0,extended:false}));
  update(input:HandInput[],dt:number,time:number,aspect:number,hold:number){
    return this.hands.map((h,i)=>{
      const p=input[i];h.valid=!!p?.valid;
      if(!h.valid){h.ready=false;h.dwell=0;h.history=[];return {capture:false,wave:false};}
      if(!h.ready){h.x=p.x;h.y=p.y;h.ready=true;h.history=[];h.speed=0;}
      const x=h.x,y=h.y,a=ease(dt,.10);h.x+=(p.x-h.x)*a;h.y+=(p.y-h.y)*a;
      const scale=Math.max(.08,p.scale),speed=Math.hypot((h.x-x)*aspect,h.y-y)/Math.max(dt,.001);
      h.speed+=(speed-h.speed)*ease(dt,.12);
      const distance=Math.hypot((h.x-p.shoulderX)*aspect,h.y-p.shoulderY);
      // Wrist must also be near shoulder height: hanging arms are not an invitation.
      h.extended=distance>scale*.8&&h.y>p.shoulderY-scale*.55;
      h.lowered=!h.extended?h.lowered+dt:0;
      if(h.lowered>.35)h.armed=true;
      h.dwell=h.extended&&h.speed<scale*.22?h.dwell+dt:0;
      h.history.push({x:h.x*aspect,t:time});h.history=h.history.filter(v=>time-v.t<1.5);
      let wave=false;
      const first=h.history[0];
      if(first&&time-first.t>.35){
        let min=first.x,max=first.x;
        for(const q of h.history){min=Math.min(min,q.x);max=Math.max(max,q.x);}
        // A deliberate outward and return sweep, rather than a one-way relocation.
        const a=h.x*aspect-first.x,span=max-min;
        wave=span>scale*.48&&Math.max(max-first.x,first.x-min)>scale*.42&&Math.abs(a)<span*.38&&h.speed>scale*.3;
      }
      return {capture:h.armed&&h.dwell>=hold,wave};
    });
  }
  consume(i:number){const h=this.hands[i];h.armed=false;h.dwell=0;h.history=[];}
}
export class MemoryInteraction {
  items:MemoryItem[]=[];readonly gestures=new MemoryGestures();
  private serial=0;private spawnClock=100;private time=0;private cooldown=0;private lost=0;
  private seeded=false;
  constructor(private random=Math.random){}
  spawn(record:MemoryRecord,x:number,y:number,group=0){
    const m:MemoryItem={id:++this.serial,record:{...record},x,y,group,speed:1,state:'FLOWING',hand:-1,age:0,formation:1,release:0,held:0,emphasis:0};this.items.push(m);return m;
  }
  update(dt:number,sceneTime:number,aspect:number,records:MemoryRecord[],hands:HandInput[],coverage:(x:number,y:number)=>number,c:MemorySettings){
    if(dt<=0)return;
    this.time+=dt;this.cooldown=Math.max(0,this.cooldown-dt);this.spawnClock+=dt;
    const triggers=this.gestures.update(hands,dt,this.time,aspect,c.captureHold);
    const pick=()=>records[Math.min(records.length-1,Math.floor(this.random()*records.length))];
    if(!this.seeded&&records.length){
      this.seeded=true;this.spawnClock=0;
      const count=Math.max(0,Math.min(8-this.items.length,Math.floor(c.memoryCount)-this.items.length));
      // Jittered screen regions keep the opening populated without clustering everything.
      const firstGroup=Math.floor(this.random()*3);
      for(let i=0;i<count;i++){
        const x=.12+.76*(i+.2+this.random()*.6)/count,group=(firstGroup+i)%3;
        this.spawn(pick(),x,riverSpine(x,group,sceneTime)+(group===0?.058:-.058),group);
      }
    }
    const normal=this.items.filter(m=>m.state==='FLOWING'||m.state==='BODY_SLOWED');
    if(records.length&&this.spawnClock>=c.memoryInterval&&normal.length<c.memoryCount&&this.items.length<8){
      const group=this.serial%3;this.spawn(pick(),-.24,riverSpine(-.24,group,sceneTime)+(group===0?.058:-.058),group);this.spawnClock=0;
    }
    let owned=this.items.find(m=>m.state==='CAPTURED'||m.state==='RELEASING');
    if(!owned&&this.cooldown===0){
      // First hand to finish its dwell wins; left wins only an exact tie.
      const candidates=[0,1].filter(i=>triggers[i]?.capture).sort((a,b)=>this.gestures.hands[b].dwell-this.gestures.hands[a].dwell);
      for(const i of candidates){
        const h=this.gestures.hands[i];
        const nearest=this.items.filter(m=>m.state==='FLOWING'||m.state==='BODY_SLOWED').map(m=>({m,d:Math.hypot((m.x-h.x)*aspect,m.y-h.y)})).filter(v=>v.d<c.captureRadius).sort((a,b)=>a.d-b.d)[0]?.m;
        let m=nearest;
        if(!m&&records.length&&this.items.length<8){m=this.spawn(pick(),h.x,h.y+.045,this.serial%3);m.formation=0;}
        if(m){m.state='CAPTURED';m.hand=i;m.held=0;this.lost=0;owned=m;this.gestures.consume(i);}
        break;
      }
    }
    for(const m of this.items){
      // Keep the enlarged silhouette on release; ease back only when capture is cancelled.
      if(m.state==='CAPTURED')m.emphasis=Math.min(1,m.emphasis+dt/3);
      else if(m.state!=='RELEASING')m.emphasis=Math.max(0,m.emphasis-dt/2.5);
      m.age+=dt;m.formation=Math.min(1,m.formation+dt/1.6);
      if(m.state==='RELEASING'){
        m.release+=dt/c.memoryReleaseTime;m.x+=c.memorySpeed*dt;
        continue;
      }
      if(m.state==='CAPTURED'){
        m.held+=dt;const h=this.gestures.hands[m.hand];
        this.lost=h.valid?0:this.lost+dt;
        if(this.lost>1.2){m.state='FLOWING';m.hand=-1;m.speed=.08;this.cooldown=1.5;continue;}
        if(h.valid){
          const targetX=Math.max(.16/aspect,Math.min(1-.16/aspect,h.x));
          const targetY=Math.max(.06,Math.min(.94,h.y+.045));
          m.x+=(targetX-m.x)*ease(dt,.55);m.y+=(targetY-m.y)*ease(dt,.55);
          if(m.held>.55&&m.formation>=1&&triggers[m.hand].wave){m.state='RELEASING';m.release=0;this.gestures.consume(m.hand);this.cooldown=1.5;}
        }
        continue;
      }
      const overlap=(coverage(m.x,m.y)*2+coverage(m.x-.06/aspect,m.y)+coverage(m.x+.06/aspect,m.y))/4;
      if(m.state==='FLOWING'&&overlap>.6)m.state='BODY_SLOWED';
      else if(m.state==='BODY_SLOWED'&&overlap<.35)m.state='FLOWING';
      m.speed+=((m.state==='BODY_SLOWED'?c.bodyTextSlowdown:1)-m.speed)*ease(dt,m.state==='BODY_SLOWED'?.5:1.2);
      m.x+=c.memorySpeed*m.speed*dt;
      const target=riverSpine(m.x,m.group,sceneTime)+(m.group===0?.058:-.058);
      m.y+=(target-m.y)*ease(dt*m.speed,.5);
    }
    this.items=this.items.filter(m=>m.x<1.3&&m.release<1);
  }
}

