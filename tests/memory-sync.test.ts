import {it,expect,vi} from 'vitest';
import {MemoryPool} from '../src/memories/MemoryPool';
const socket=vi.hoisted(()=>({on:vi.fn(),connect:vi.fn(),disconnect:vi.fn(),connected:true}));
vi.mock('socket.io-client',()=>({io:()=>socket}));
import {MemorySync} from '../src/integrations/MemorySync';
const row=(id:string)=>({id,name:'同学',major:'专业',year:2026,content:'数据库文字'});
it('buffers initial approval/duplicate/removal events against snapshot revision, retains pool on failure',async()=>{
 vi.useFakeTimers();socket.on.mockClear();
 const pending:{resolve:(value:unknown)=>void;reject:(error:unknown)=>void}[]=[];
 const fetcher=vi.fn(()=>new Promise((resolve,reject)=>pending.push({resolve,reject})));
 vi.stubGlobal('fetch',fetcher);const pool=new MemoryPool(()=>{});const sync=new MemorySync(pool);
 const handler=(name:string)=>socket.on.mock.calls.find(c=>c[0]===name)![1];
 try{
  handler('message:approved')({epoch:'first',revision:1,record:row('live')});
  pending[0].resolve({ok:true,json:async()=>({ok:true,epoch:'first',revision:1,items:[row('old'),row('live')]})});
  await vi.advanceTimersByTimeAsync(0);expect(pool.queue).toEqual(['live']);
  handler('message:approved')({epoch:'first',revision:1,record:row('live')});expect(pool.queue).toEqual(['live']);
  const refreshed=sync.sync();handler('message:removed')({epoch:'first',revision:2,id:'live'});
  pending[1].resolve({ok:true,json:async()=>({ok:true,epoch:'first',revision:1,items:[row('old'),row('live')]})});
  await refreshed;expect(pool.records.has('live')).toBe(false);expect(pool.queue).toEqual([]);
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  const outage=sync.sync();pending[2].reject(new Error('offline'));await outage;
  expect(pool.records.has('old')).toBe(true);warn.mockRestore();
 }finally{sync.dispose();vi.unstubAllGlobals();vi.useRealTimers();}
});
it('owns one retry timer, reports recovery state and cancels retry work on dispose',async()=>{
 vi.useFakeTimers();socket.on.mockClear();socket.connected=true;
 const fetcher=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ok:true,json:async()=>({ok:true,epoch:'restored',revision:0,items:[row('recovered')]})});
 vi.stubGlobal('fetch',fetcher);const pool=new MemoryPool(()=>{});const sync=new MemorySync(pool);
 try{
  await vi.advanceTimersByTimeAsync(0);expect(sync.state).toBe('synchronization-error');
  await vi.advanceTimersByTimeAsync(3000);expect(sync.state).toBe('connected');expect(sync.lastSyncTime).not.toBeNull();expect(pool.records.has('recovered')).toBe(true);
  sync.dispose();const count=fetcher.mock.calls.length;await vi.advanceTimersByTimeAsync(60000);expect(fetcher.mock.calls.length).toBe(count);
 }finally{sync.dispose();vi.unstubAllGlobals();vi.useRealTimers();}
});
