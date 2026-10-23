import {io} from 'socket.io-client';
import {MemoryPool} from '../memories/MemoryPool';
import type {MemoryRecord} from '../memories/MemoryRecord';
interface DisplayRecord {id:string;name:string;major:string;year:number;content:string}
interface Event {epoch:string;revision:number;record?:DisplayRecord;id?:string}
const map=(r:DisplayRecord):MemoryRecord=>({id:r.id,name:r.name,major:r.major,year:String(r.year),message:r.content});
export class MemorySync {
  readonly socket;
  state:'connected'|'disconnected'|'reconnecting'|'synchronization-error'='disconnected';
  lastSyncTime:number|null=null;
  private retry?:ReturnType<typeof setTimeout>;private disposed=false;private failures=0;
  private generation=0;private syncing=false;private buffer:Event[]=[];
  private epoch='';private revision=-1;private controller?:AbortController;
  private timer:ReturnType<typeof setInterval>;
  constructor(readonly pool:MemoryPool,private base=''){
    this.socket=base?io(base,{autoConnect:false,reconnection:true,reconnectionDelay:1000,reconnectionDelayMax:15000}):io({autoConnect:false,reconnection:true,reconnectionDelay:1000,reconnectionDelayMax:15000});
    this.socket.on('connect',()=>void this.sync());
    this.socket.on('disconnect',()=>{this.state='disconnected';this.generation++;this.controller?.abort();this.syncing=false;this.buffer=[];this.scheduleRetry();});
    this.socket.on('connect_error',()=>{this.state='reconnecting';});
    this.socket.io?.on('reconnect_attempt',()=>{this.state='reconnecting';});
    this.socket.on('message:approved',(e:Event)=>this.event(e));
    this.socket.on('message:removed',(e:Event)=>this.event(e));
    this.timer=setInterval(()=>{if(!this.syncing)void this.sync();},30000);
    this.socket.connect();
    void this.sync(); // HTTP loading also works if a proxy blocks websocket upgrades.
  }
  private scheduleRetry(){
    if(this.retry||this.disposed)return;
    this.retry=setTimeout(()=>{this.retry=undefined;if(!this.disposed&&!this.syncing)void this.sync();},Math.min(30000,3000*2**Math.min(4,this.failures++)));
  }
  private event(e:Event){
    if(this.syncing){this.buffer.push(e);return;}
    if(e.epoch!==this.epoch){this.buffer.push(e);void this.sync();return;}
    if(e.revision<=this.revision)return;
    this.revision=e.revision;
    if(e.record)this.pool.approved(map(e.record));else if(e.id)this.pool.removed(e.id);
  }
  async sync(){
    if(this.disposed)return;
    if(this.retry){clearTimeout(this.retry);this.retry=undefined;}
    const generation=++this.generation;this.controller?.abort();
    const controller=this.controller=new AbortController();this.syncing=true;
    const timeout=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch(`${this.base}/api/display/messages`,{cache:'no-store',signal:controller.signal,credentials:'omit'});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();
      if(!data.ok||!Array.isArray(data.items)||typeof data.epoch!=='string'||!Number.isInteger(data.revision))throw new Error('Invalid memory snapshot');
      if(generation!==this.generation)return;
      this.epoch=data.epoch;this.revision=data.revision;
      // An approval arriving while the first HTTP snapshot is in flight still earns
      // its first-entry slot, even if that snapshot already includes the same row.
      const liveIds=new Set(this.buffer.filter(e=>e.epoch===data.epoch&&e.record).map(e=>e.record!.id));
      this.pool.snapshot(data.items.map(map),liveIds);this.syncing=false;
      this.lastSyncTime=Date.now();this.failures=0;this.state=this.socket.connected?'connected':'disconnected';
      const buffered=this.buffer;this.buffer=[];
      for(const e of buffered)if(e.epoch===this.epoch&&e.revision>this.revision)this.event(e);
    }catch(error){
      if(generation!==this.generation)return;
      this.syncing=false;
      // Preserve the loaded pool and replay newer events; retry from authoritative SQLite.
      const buffered=this.buffer;this.buffer=[];
      for(const e of buffered)if(e.epoch===this.epoch)this.event(e);
      this.state='synchronization-error';this.scheduleRetry();
    }finally{clearTimeout(timeout);}
  }
  dispose(){this.disposed=true;this.generation++;this.controller?.abort();clearInterval(this.timer);if(this.retry)clearTimeout(this.retry);this.socket.disconnect();}
}
