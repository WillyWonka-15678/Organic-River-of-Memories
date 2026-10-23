import type {MemoryRecord} from './MemoryRecord';
export class MemoryPool {
  records=new Map<string,MemoryRecord>();
  queue:string[]=[];
  private seen=new Set<string>();
  private initialized=false;
  constructor(private changed:(records:MemoryRecord[],removed:string[])=>void){}
  private notify(removed:string[]=[]){this.changed([...this.records.values()],removed);}
  snapshot(records:MemoryRecord[],liveIds=new Set<string>()){
    const next=new Map(records.map(r=>[r.id,r]));
    const removed=[...this.records.keys()].filter(id=>!next.has(id));
    for(const r of records){
      if((this.initialized||liveIds.has(r.id))&&!this.seen.has(r.id))this.queue.push(r.id);
      this.seen.add(r.id);
    }
    this.records=next;this.queue=this.queue.filter(id=>next.has(id));
    this.initialized=true;this.notify(removed);
  }
  approved(record:MemoryRecord){
    this.records.set(record.id,record);
    if(!this.seen.has(record.id)){this.seen.add(record.id);this.queue.push(record.id);}
    this.notify();
  }
  removed(id:string){this.records.delete(id);this.queue=this.queue.filter(v=>v!==id);this.notify([id]);}
  take(){while(this.queue.length){const r=this.records.get(this.queue.shift()!);if(r)return r;}return undefined;}
}
