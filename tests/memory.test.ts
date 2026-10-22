import { describe,it,expect } from 'vitest';
import { MemoryInteraction,memoryHands,type HandInput } from '../src/memories/MemoryInteraction';
import {mapPose,PoseTrack} from '../src/interaction/PoseTrack';
const settings={memoryCount:0,memoryInterval:8,memorySpeed:.023,bodyTextSlowdown:.08,captureRadius:.18,captureHold:.7,memoryReleaseTime:3.5};
const records=[{id:'one',message:'愿你始终热爱'}];
const hand=(x=.7,y=.5):HandInput=>({x,y,shoulderX:.45,shoulderY:.5,scale:.2,valid:true});
function run(m:MemoryInteraction,seconds:number,h:HandInput[]=[],coverage=0,hz=60){for(let i=0;i<seconds*hz;i++)m.update(1/hz,i/hz,16/9,records,h,()=>coverage,settings);}
describe('memory interaction',()=>{
 it.each([0,1])('either arm captures and enlarges when reaching left with opposite shoulder occluded: %s',(side)=>{
   const pose=new PoseTrack(),m=new MemoryInteraction();const item=m.spawn(records[0],.49,.55);
   for(let i=1;i<=360;i++){
     const points=Array.from({length:33},()=>({x:.5,y:.5,visibility:0}));
     points[11+side]={x:.82,y:.45,visibility:.9};points[13+side]={x:.66,y:.45,visibility:.9};points[15+side]={x:.49,y:.45,visibility:.9};
     pose.update(mapPose(points),i*1000/60,i*1000/60,1/60,.1,16/9);
     m.update(1/60,i/60,16/9,records,memoryHands(pose.joints,pose.presence,16/9),()=>1,settings);
   }
   expect(item.state).toBe('CAPTURED');expect(item.hand).toBe(side);expect(item.emphasis).toBe(1);
   expect(pose.joints[12-side].confidence).toBe(0);
 });
 it('slows intact messages, holds boundary hysteresis, then recovers',()=>{const m=new MemoryInteraction();const a=m.spawn(records[0],.4,.5);run(m,3,[],1);expect(a.state).toBe('BODY_SLOWED');expect(a.speed).toBeCloseTo(.08,2);run(m,.2,[],.45);expect(a.state).toBe('BODY_SLOWED');run(m,5);expect(a.state).toBe('FLOWING');expect(a.speed).toBeGreaterThan(.98);expect(a.formation).toBe(1);expect(a.record.message).toBe(records[0].message);});
 it('captures nearest intact message without teleport and ignores body slowdown',()=>{const m=new MemoryInteraction();const a=m.spawn(records[0],.69,.5);m.spawn(records[0],.3,.5);run(m,.72,[hand()],1);expect(a.state).toBe('CAPTURED');expect(Math.abs(a.x-.69)).toBeLessThan(.03);run(m,2,[hand()],1);expect(a.x).toBeCloseTo(.7,2);expect(a.record.message).toBe(records[0].message);});
 it('summons one message, forms it and does not repeat while held',()=>{const m=new MemoryInteraction();run(m,.72,[hand(),hand()]);expect(m.items).toHaveLength(1);expect(m.items[0].formation).toBeLessThan(.1);run(m,4,[hand(),hand()]);expect(m.items).toHaveLength(1);expect(m.items[0].formation).toBe(1);});
 it('holds through short tracking loss and resumes intact flow after prolonged loss',()=>{const m=new MemoryInteraction();run(m,3,[hand()]);run(m,.5);expect(m.items[0].state).toBe('CAPTURED');run(m,1);expect(m.items[0].state).toBe('FLOWING');expect(m.items[0].release).toBe(0);});
 it('releases only captured text after outward and return wave, then recycles',()=>{const m=new MemoryInteraction();run(m,3,[hand()]);const a=m.items[0];const other=m.spawn(records[0],.1,.4);for(let i=0;i<60;i++){const x=.7+.15*Math.sin(Math.PI*i/60);m.update(1/60,i/60,16/9,records,[hand(x)],()=>0,settings);}expect(a.state).toBe('RELEASING');expect(other.state).toBe('FLOWING');run(m,4,[hand()]);expect(m.items.some(v=>v.id===a.id)).toBe(false);expect(m.items).toHaveLength(1);});
 it('one-way hand motion does not release; empty-hand waves do not fragment flowing text',()=>{const m=new MemoryInteraction();run(m,3,[hand()]);for(let i=0;i<60;i++)m.update(1/60,0,16/9,records,[hand(.7+i*.002)],()=>0,settings);expect(m.items[0].state).toBe('CAPTURED');const n=new MemoryInteraction();const a=n.spawn(records[0],.1,.4);for(let i=0;i<60;i++)n.update(1/60,0,16/9,records,[hand(.7+.15*Math.sin(Math.PI*i/60))],()=>0,settings);expect(a.state).toBe('FLOWING');expect(a.release).toBe(0);});
 it('time-based slowdown is consistent at 30 and 120 Hz and generation is bounded',()=>{const a=new MemoryInteraction(),b=new MemoryInteraction();a.spawn(records[0],.1,.5);b.spawn(records[0],.1,.5);run(a,2,[],1,30);run(b,2,[],1,120);expect(a.items[0].speed).toBeCloseTo(b.items[0].speed,5);expect(Math.abs(a.items[0].x-b.items[0].x)).toBeLessThan(.001);const n=new MemoryInteraction();for(let i=0;i<6000;i++)n.update(1/60,0,16/9,records,[],()=>0,{...settings,memoryCount:5,memoryInterval:3});expect(n.items.length).toBeLessThanOrEqual(5);expect(n.items.length).toBeGreaterThan(0);});
});
