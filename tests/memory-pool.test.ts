import {it,expect} from 'vitest';
import {MemoryPool} from '../src/memories/MemoryPool';
import {MemoryInteraction} from '../src/memories/MemoryInteraction';
const record=(id:string)=>({id,message:`寄语${id}`});
it('approval received during initial snapshot is queued once even when included in snapshot',()=>{
 const pool=new MemoryPool(()=>{});
 pool.snapshot([record('history'),record('during-load')],new Set(['during-load']));
 pool.approved(record('during-load'));expect(pool.queue).toEqual(['during-load']);
 pool.take();pool.snapshot([record('history'),record('during-load')]);expect(pool.queue).toEqual([]);
});
it('one reserved slot admits new phones without clearing a full historical screen',()=>{
 const pool=new MemoryPool(()=>{}),m=new MemoryInteraction(()=>.5);
 pool.snapshot([record('old')]);m.nextPriority=()=>pool.take();m.priorityWaiting=()=>pool.queue.length>0;
 const c={memoryCount:5,memoryInterval:8,memorySpeed:.023,bodyTextSlowdown:.08,captureRadius:.18,captureHold:.7,memoryReleaseTime:3.5};
 m.update(.01,0,16/9,[record('old')],[],()=>0,c);const opening=m.items.map(m=>m.id);
 pool.approved(record('phone'));for(let i=0;i<481;i++)m.update(1/60,0,16/9,[...pool.records.values()],[],()=>1,c);
 expect(m.items).toHaveLength(6);expect(m.items.some(m=>m.record.id==='phone'&&m.x<0)).toBe(true);expect(opening.every(id=>m.items.some(m=>m.id===id))).toBe(true);
});
it('initial pool, live duplicate events, reconnect catch-up and removal',()=>{
 const removed:string[]=[];const pool=new MemoryPool((_r,ids)=>removed.push(...ids));
 pool.snapshot([record('a')]);expect(pool.queue).toEqual([]);
 pool.approved(record('b'));pool.approved(record('b'));expect(pool.queue).toEqual(['b']);
 expect(pool.take()?.id).toBe('b');pool.snapshot([record('a'),record('b'),record('c')]);
 expect(pool.queue).toEqual(['c']);pool.removed('c');expect(pool.take()).toBeUndefined();
 pool.snapshot([record('b')]);expect(removed).toContain('a');expect(pool.records.size).toBe(1);
});
it('priority FIFO enters the existing left edge spawn and removed captures fade out',()=>{
 const pool=new MemoryPool(()=>{}),m=new MemoryInteraction(()=>.5);
 pool.snapshot([record('old')]);m.nextPriority=()=>pool.take();m.priorityWaiting=()=>pool.queue.length>0;
 const c={memoryCount:2,memoryInterval:.2,memorySpeed:.023,bodyTextSlowdown:.08,captureRadius:.18,captureHold:.7,memoryReleaseTime:3.5};
 m.update(.01,0,16/9,[...pool.records.values()],[],()=>0,c);
 m.items=[];pool.approved(record('new1'));pool.approved(record('new2'));
 for(let i=0;i<50;i++)m.update(.01,0,16/9,[...pool.records.values()],[],()=>0,c);
 expect(m.items.map(v=>v.record.id)).toEqual(['new1','new2']);expect(m.items.every(v=>v.x<0)).toBe(true);
 m.items[0].state='CAPTURED';m.items[0].hand=0;m.removeRecord('new1');
 expect(m.items[0].hand).toBe(-1);m.update(.4,0,16/9,[record('new2')],[],()=>0,c);expect(m.items[0].opacity).toBeCloseTo(.5);
 m.update(.41,0,16/9,[record('new2')],[],()=>0,c);expect(m.items.some(v=>v.record.id==='new1')).toBe(false);
});
