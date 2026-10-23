import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {io} from 'socket.io-client';
import {openMessages} from './messages.mjs';
import {seedMessages} from './seed.mjs';
import {studyMemories} from '../src/memories/MemoryRecord.ts';
import {createMessageServer} from './realtime.mjs';
test('legacy migration, backup, exact seeds, idempotence and history preservation',()=>{
 const dir=mkdtempSync(join(tmpdir(),'river-migrate-')),file=join(dir,'old.sqlite');
 try{
  const old=new DatabaseSync(file);old.exec("CREATE TABLE messages(id TEXT PRIMARY KEY,name TEXT NOT NULL,major TEXT NOT NULL,year INTEGER NOT NULL,content TEXT NOT NULL,createdAt TEXT NOT NULL,status TEXT NOT NULL CHECK(status='pending'));INSERT INTO messages VALUES('phone-old','真实昵称','专业',2026,'历史内容不能覆盖','2026-10-01','pending');");old.close();
  const store=openMessages(file);
  try{
   assert.ok(existsSync(`${file}.pre-stage3.bak`));assert.equal(seedMessages(store).added,3);assert.equal(seedMessages(store).added,0);
   assert.equal(store.list(1,100).total,4);assert.equal(store.list(1,100).items.find(r=>r.id==='phone-old').status,'pending');
   for(const original of studyMemories){const row=store.approved().find(r=>r.id===`seed:${original.id}`);assert.equal(row.content,original.message);assert.equal(row.name,original.name??'');assert.equal(row.major,original.major??'');assert.equal(String(row.year),original.year);}
  }finally{store.close();}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('same HTTP server broadcasts approved only; reconnect snapshot, removal, safe production mode',async()=>{
 const store=openMessages(':memory:');seedMessages(store);const runtime=createMessageServer(store);
 runtime.server.listen(0,'127.0.0.1');await once(runtime.server,'listening');
 const base=`http://127.0.0.1:${runtime.server.address().port}`;const socket=io(base,{autoConnect:false});
 try{
  socket.connect();await once(socket,'connect');
  const arrived=once(socket,'message:approved');
  const response=await fetch(`${base}/api/messages`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:'实时中文手机记忆'})});
  const result=await response.json();assert.equal(result.status,'approved');
  const [event]=await arrived;assert.equal(event.record.id,result.id);assert.equal(event.record.content,'实时中文手机记忆');assert.ok(!('status' in event.record));
  store.save({name:'隐藏昵称',major:'',year:2026,content:'pending不公开'});
  let snapshot=await(await fetch(`${base}/api/display/messages`)).json();assert.equal(snapshot.items.length,4);assert.ok(!JSON.stringify(snapshot).includes('隐藏昵称'));
  socket.disconnect();const missed=store.save({name:'',major:'',year:2026,content:'断线期间新增'},'approved');
  socket.connect();await once(socket,'connect');snapshot=await(await fetch(`${base}/api/display/messages`)).json();assert.ok(snapshot.items.some(r=>r.id===missed.id));
  const removed=once(socket,'message:removed');store.hide(result.id);runtime.publishRemoved(result.id);assert.equal((await removed)[0].id,result.id);
  snapshot=await(await fetch(`${base}/api/display/messages`)).json();assert.ok(!snapshot.items.some(r=>r.id===result.id));
  assert.equal((await fetch(`${base}/api/messages`)).status,403);
 }finally{socket.disconnect();await new Promise(r=>runtime.io.close(r));store.close();}
 const pendingStore=openMessages(':memory:');pendingStore.changeSetting(false,'test');const pendingRuntime=createMessageServer(pendingStore);
 pendingRuntime.server.listen(0,'127.0.0.1');await once(pendingRuntime.server,'listening');
 const client=io(`http://127.0.0.1:${pendingRuntime.server.address().port}`,{autoConnect:false});let emitted=false;
 try{client.on('message:approved',()=>emitted=true);client.connect();await once(client,'connect');
  await fetch(`http://127.0.0.1:${pendingRuntime.server.address().port}/api/messages`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:'等待审核'})});
  await new Promise(r=>setTimeout(r,100));assert.equal(emitted,false);assert.equal(pendingStore.approved().length,0);
 }finally{client.disconnect();await new Promise(r=>pendingRuntime.io.close(r));pendingStore.close();}
});
