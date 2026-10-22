import {transportParcel,sampleWake,wakeUniforms,updateWakeUniforms} from '../src/render/wakeField';
import {describe,it,expect} from 'vitest';
import {BodyWake,BodyMotion,torsoSample,headSample,riverVelocity} from '../src/interaction/BodyWake';
import {config} from '../src/config';
import type {PosePoint} from '../src/interaction/PoseTrack';
const aspect=16/9;
const sample=(x:number,stamp:number,valid=true)=>({x,y:.5,width:.2,stamp,valid});
describe('Body Wake input and lifecycle',()=>{
  it('rejects still-body noise, stops on held position, resets gaps and jumps',()=>{
    const m=new BodyMotion();
    for(let i=0;i<90;i++)m.sample(sample(.4+Math.sin(i)*.0008,i/15),i/15,aspect,.045,.22);
    expect(m.moving).toBe(false);
    for(let i=90;i<135;i++)m.sample(sample(.4+(i-90)*.005,i/15),i/15,aspect,.045,.22);
    expect(m.moving).toBe(true);
    for(let i=135;i<141;i++)m.sample(sample(.62,i/15),i/15,aspect,.045,.22);
    expect(m.moving).toBe(false);
    m.sample(sample(.9,11),11,aspect,.045,.22);expect(m.moving).toBe(false);expect(m.vx).toBe(0);
    m.sample(sample(.2,11.07),11.07,aspect,.045,.22);expect(m.moving).toBe(false);expect(m.vx).toBe(0);
    m.sample(sample(.2,11.07),12,aspect,.045,.22);expect(m.valid).toBe(false);
  });
  it('uses only shoulders and hips; rejects low-confidence torso',()=>{
    const p:PosePoint[]=Array.from({length:33},()=>({x:.5,y:.5,z:0,confidence:.95}));
    p[11].x=.4;p[12].x=.6;p[23].y=.7;p[24].y=.7;
    const before=torsoSample(p,1,aspect);p[15].x=.1;p[16].y=.9;
    expect(torsoSample(p,1,aspect)).toEqual(before);
    expect(before.x).toBe(.5);expect(before.y).toBeCloseTo(.6);
    p[23].confidence=.1;expect(torsoSample(p,1,aspect).source).toBe('shoulders');
    p[23].confidence=.95;p[11].confidence=.1;expect(torsoSample(p,1,aspect).source).toBe('hips');
    p[23].confidence=.1;expect(torsoSample(p,1,aspect).valid).toBe(false);
  });
  it('caps count, trails behind movement, does not spawn at rest, and expires',()=>{
    const w=new BodyWake(()=>.5),c={...config,wakeMaximum:2};
    for(let i=1;i<600;i++){
      w.motion.sample(sample(.1+i*.001,i/60),i/60,aspect,c.wakeThreshold,c.wakeSmoothing);
      w.update(1/60,i/60,aspect,c);expect(w.wakes.filter(Boolean).length).toBeLessThanOrEqual(2);
      for(const v of w.wakes)if(v&&v.age===0)expect(v.x).toBeLessThan(w.motion.x);
    }
    expect(w.spawned).toBeGreaterThan(0);const total=w.spawned;
    w.motion.reset();for(let i=0;i<1200;i++)w.update(1/60,10+i/60,aspect,c);
    expect(w.spawned).toBe(total);expect(w.wakes.filter(Boolean)).toHaveLength(0);
  });
  it('advection and age agree at 30 and 120 fps after detaching from the body',()=>{
    const run=(fps:number)=>{
      const w=new BodyWake(()=>.5);w.wakes[0]={x:.4,y:.5,age:0,life:10,radius:.1,strength:.06,direction:1,seed:.5,expansion:.05,dissipation:1.3,vx:0,vy:0};
      for(let i=0;i<fps*4;i++)w.update(1/fps,(i+1)/fps,aspect,config);
      return w.wakes[0]!;
    };
    const a=run(30),b=run(120);expect(a.age).toBeCloseTo(b.age,6);expect(Math.abs(a.x-b.x)).toBeLessThan(.001);expect(Math.abs(a.y-b.y)).toBeLessThan(.001);
  });
  it('samples local river direction and closes wake mode cleanly',()=>{
    expect(riverVelocity(.1,.5,0,.12,aspect).y).not.toBeCloseTo(riverVelocity(.8,.5,0,.12,aspect).y,2);
    const w=new BodyWake();w.motion.moving=true;w.motion.valid=true;w.motion.vx=.2;
    w.update(1,1,aspect,{...config,wakeMode:'off'});expect(w.wakes.filter(Boolean)).toHaveLength(0);expect(w.motion.moving).toBe(false);
  });
});


describe('transported wake field',()=>{
  it('allows either visible pair, and re-baselines source changes without false velocity',()=>{
    const points:PosePoint[]=Array.from({length:33},()=>({x:.5,y:.5,z:0,confidence:0}));
    const m=new BodyMotion();let t=0;
    for(const pair of [[11,12],[23,24]]){
      points.forEach(p=>p.confidence=0);
      pair.forEach((i,k)=>Object.assign(points[i],{x:.4+k*.1,y:i<20?.7:.3,confidence:.95}));
      t+=1/15;m.sample(torsoSample(points,t,aspect),t,aspect,.045,.22);
      expect(m.moving).toBe(false);expect(m.vx).toBe(0);expect(m.vy).toBe(0);
      for(let j=0;j<25;j++){
        pair.forEach(i=>points[i].x+=.004);t+=1/15;
        m.sample(torsoSample(points,t,aspect),t,aspect,.045,.22);
      }
      expect(m.moving).toBe(true);
    }
  });
  it('has a finite core, tangential direction, smooth falloff and bounded overlap',()=>{
    const u=wakeUniforms();u.uWakeCentre.value.forEach(c=>c.set(.5,.5,.11,.12));
    const centre=sampleWake(.5,.5,aspect,u.uWakeCentre.value);
    expect(centre.x).toBe(0);expect(centre.y).toBe(0);
    const right=sampleWake(.54,.5,aspect,u.uWakeCentre.value);
    expect(right.x).toBe(0);expect(right.y).toBeGreaterThan(0);
    for(let x=0;x<1;x+=.01)for(let y=0;y<1;y+=.01){
      const v=sampleWake(x,y,aspect,u.uWakeCentre.value);
      expect(Math.hypot(v.x,v.y)).toBeLessThanOrEqual(.16);
    }
    expect(Math.hypot(...Object.values(sampleWake(0,0,aspect,u.uWakeCentre.value)).slice(0,2))).toBeLessThan(.0001);
  });
  it('transports parcels continuously, with comparable 30/120 fps paths',()=>{
    const run=(fps:number,enabled=true)=>{
      const wake=new BodyWake();wake.wakes[0]={x:.5,y:.5,age:2,life:10,radius:.11,strength:.1,direction:1,seed:0,expansion:0,dissipation:1,vx:0,vy:0};
      const u=wakeUniforms();if(enabled)updateWakeUniforms(u,wake);
      const p=new Float32Array([.44,.53,.06,0]);
      for(let i=0;i<fps*3;i++)transportParcel(p,0,1/fps,(i+1)/fps,aspect,.08,u.uWakeCentre.value);
      return {x:p[0],y:p[1]};
    };
    const a=run(30),b=run(120);
    expect(Math.hypot((a.x-b.x)*aspect,a.y-b.y)).toBeLessThan(.004);
    const off=run(120,false);
    expect(Math.hypot((b.x-off.x)*aspect,b.y-off.y)).toBeGreaterThan(.02);
  });
});


describe('head wake input',()=>{
  it('tracks the ear midpoint and emits a smaller wake without a torso',()=>{
    const points:PosePoint[]=Array.from({length:33},()=>({x:0,y:0,z:0,confidence:0}));
    const w=new BodyWake(()=>.5);
    for(let i=0;i<90;i++){
      points[7]={x:.3+i*.003-.025,y:.65,z:0,confidence:.95};
      points[8]={x:.3+i*.003+.025,y:.65,z:0,confidence:.95};
      const h=headSample(points,i/15,aspect);
      expect(h.x).toBeCloseTo(.3+i*.003);expect(h.y).toBe(.65);
      w.headMotion.sample(h,i/15,aspect,config.wakeThreshold*1.15,config.wakeSmoothing*1.25);
      w.update(1/15,i/15,aspect,config);
    }
    expect(w.spawned).toBeGreaterThan(0);
    for(const v of w.wakes)if(v){expect(v.radius).toBeLessThan(config.wakeRadius);expect(v.strength).toBeLessThan(config.wakeRotation);}
    const count=w.spawned;
    for(let i=90;i<110;i++){
      w.headMotion.sample(headSample(points,i/15,aspect),i/15,aspect,config.wakeThreshold*1.15,config.wakeSmoothing*1.25);
      w.update(1/15,i/15,aspect,config);
    }
    expect(w.headMotion.moving).toBe(false);expect(w.spawned).toBe(count);
    points.forEach(p=>p.confidence=0);
    expect(headSample(points,8,aspect).valid).toBe(false);
  });
});
