import { easingAlpha } from './field';
export interface CameraLandmark { x:number;y:number;z?:number;visibility?:number;presence?:number }
export interface PosePoint { x:number;y:number;z:number;confidence:number }
export interface TrackedJoint extends PosePoint { vx:number;vy:number }
export const STAR_NODES=Array.from({length:36},(_,i)=>i);
export const CONSTELLATION_LINKS=[
  [0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],[9,10],[0,9],[0,10],
  [0,33],[33,11],[33,12],[11,12],[33,34],[34,35],[35,23],[35,24],
  [11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],
  [15,17],[15,19],[15,21],[17,19],[16,18],[16,20],[16,22],[18,20],
  [23,25],[25,27],[24,26],[26,28],[27,29],[29,31],[27,31],[28,30],[30,32],[28,32],
];
const movingJoints=[11,12,13,14,15,16,23,24,25,26,27,28];
export function mapPose(points:CameraLandmark[]):PosePoint[]{
  return points.slice(0,33).map(p=>{
    const finite=Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=-.03&&p.x<=1.03&&p.y>=-.03&&p.y<=1.03;
    return {x:finite?p.x:0,y:finite?1-p.y:0,z:Number.isFinite(p.z)?p.z!:0,
      confidence:finite?Math.max(0,Math.min(1,p.visibility??0,p.presence??1)):0};
  });
}
export class PoseTrack {
  joints:TrackedJoint[]=Array.from({length:36},()=>({x:.5,y:.5,z:0,confidence:0,vx:0,vy:0}));
  private target:PosePoint[]=[];
  private raw:PosePoint[]=[];
  private lastStamp=-1;
  private lastGood=-Infinity;
  private arrived=-Infinity;
  private observedMotion=0;
  motion=0;
  presence=0;
  formation=0;
  update(points:PosePoint[],stamp:number,now:number,dt:number,smoothing:number,aspect:number,enabled=true){
    if(stamp!==this.lastStamp){
      const gap=Math.max(.025,(stamp-this.lastStamp)/1000);
      this.lastStamp=stamp;
      const visible=(i:number)=>(points[i]?.confidence??0)>.5;
      // An unobscured arm is sufficient near a screen edge or when turned sideways.
      // Keep confidence per joint: absent shoulders must not fabricate a torso.
      const torso=visible(11)&&visible(12)&&points.filter(p=>p.confidence>.5).length>=4;
      const arm=[0,1].some(i=>visible(11+i)&&visible(13+i)&&visible(15+i));
      const valid=torso||arm;
      if(valid){
        const reacquired=now-this.lastGood>900;
        if(reacquired)this.arrived=now;
        const speeds:number[]=[];
        this.target=points.map((p,i)=>{
          const old=this.raw[i];
          const speed=old&&old.confidence>.5?Math.hypot((p.x-old.x)*aspect,p.y-old.y)/gap:0;
          if(!reacquired&&speed>4&&p.confidence>.5)return {...p,confidence:0};
          if(movingJoints.includes(i)&&p.confidence>.5&&old?.confidence>.5&&!reacquired)speeds.push(speed);
          return p;
        });
        speeds.sort((a,b)=>b-a);
        const top=speeds.slice(0,6);
        const energy=Math.max(top.reduce((a,b)=>a+b,0)/Math.max(1,top.length),(top[0]??0)*.65);
        this.observedMotion=Math.sqrt(Math.max(0,Math.min(1,(energy-.025)*3.5)));
        this.lastGood=now;
      } else {this.target=[];this.observedMotion=0;}
      this.raw=points;
    }
    const fresh=enabled&&now-stamp<700&&now-this.lastGood<700;
    this.presence+=((fresh?1:0)-this.presence)*easingAlpha(dt,fresh?.3:.85);
    this.motion+=((fresh?this.observedMotion:0)-this.motion)*easingAlpha(dt,this.observedMotion>this.motion?.18:1.25);
    const arrival=Math.max(0,1-(now-this.arrived)/3500);
    const targetFormation=this.presence*Math.max(this.motion,arrival);
    this.formation+=(targetFormation-this.formation)*easingAlpha(dt,targetFormation>this.formation?.3:1.1);
    const alpha=easingAlpha(dt,smoothing/(1+this.motion*2.5));
    for(let i=0;i<33;i++){
      const j=this.joints[i],p=this.target[i];
      const valid=fresh&&p&&p.confidence>.5;
      const oldX=j.x,oldY=j.y;
      if(valid){
        if(j.confidence<.02){j.x=p.x;j.y=p.y;}
        else{j.x+=(p.x-j.x)*alpha;j.y+=(p.y-j.y)*alpha;}
        j.z+=(p.z-j.z)*alpha;
      }
      j.confidence+=((valid?p.confidence:0)-j.confidence)*easingAlpha(dt,valid?.12:.35);
      j.vx=valid?(j.x-oldX)/Math.max(dt,.001):0;j.vy=valid?(j.y-oldY)/Math.max(dt,.001):0;
    }
    this.midpoint(33,11,12,.5);this.midpoint(35,23,24,.5);this.midpoint(34,33,35,.35);
  }
  private midpoint(index:number,a:number,b:number,t:number){
    const j=this.joints[index],p=this.joints[a],q=this.joints[b];
    j.x=p.x+(q.x-p.x)*t;j.y=p.y+(q.y-p.y)*t;j.z=p.z+(q.z-p.z)*t;
    j.confidence=Math.min(p.confidence,q.confidence);j.vx=p.vx+(q.vx-p.vx)*t;j.vy=p.vy+(q.vy-p.vy)*t;
  }
  get visibleNodes(){return STAR_NODES.filter(i=>this.joints[i].confidence>.3).length;}
  wrist(index:0|1){
    const j=this.joints[index===0?15:16];
    return {x:j.x,y:j.y,strength:j.confidence*this.presence*this.formation,activity:this.motion};
  }
}
