import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createApp} from './app.mjs';
import {openMessages} from './messages.mjs';

test('Chinese messages, validation, pagination, rate limit and restart persistence',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'river-')),filename=join(dir,'messages.sqlite');
 let store,server;
 async function start(devQuery){store=openMessages(filename);store.changeSetting(false,'test');server=createApp({store,devQuery}).listen(0,'127.0.0.1');await once(server,'listening');return `http://127.0.0.1:${server.address().port}`;}
 async function stop(){server.closeAllConnections();await new Promise(r=>server.close(r));store.close();}
 try{
   let base=await start(true);
   const post=value=>fetch(`${base}/api/messages`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
   assert.equal((await fetch(`${base}/submit`)).status,200);
   const first=await post({name:' 小林 ',major:' 数字媒体 ',year:'2026',content:' 愿你始终热爱 🌊 '});
   assert.equal(first.status,201);const saved=await first.json();assert.equal(saved.status,'pending');assert.ok(saved.id);
   assert.equal((await post({content:'第二段记忆'})).status,201);
   for(const invalid of [{content:'   '},{content:'字'.repeat(61)},{content:'正常',status:'approved'},{content:'正常',name:10},{content:'正常',major:'字'.repeat(41)},{content:'正常',year:'abc'},{content:'正常',name:'字'.repeat(21)}])assert.equal((await post(invalid)).status,400);
   assert.equal((await post({content:'第十次请求'})).status,201);
   const limited=await post({content:'超过频率'});assert.equal(limited.status,429);assert.ok(limited.headers.get('retry-after'));
   assert.equal((await fetch(`${base}/api/messages?page=1&limit=1`)).status,403);
   let listing=store.list(1,1);assert.equal(listing.total,3);assert.equal(listing.items.length,1);
   await stop();base=await start(true);
   listing=store.list(1,20);assert.equal(listing.total,3);
   const restored=listing.items.find(m=>m.id===saved.id);assert.equal(restored.name,'小林');assert.equal(restored.content,'愿你始终热爱 🌊');assert.equal(restored.status,'pending');
   assert.ok(listing.items.some(m=>m.name==='匿名毕业生'&&m.year===2026));
   await stop();base=await start(false);
   assert.equal((await fetch(`${base}/api/messages`)).status,403);
   assert.equal((await fetch(`${base}/api/health`)).status,200);
 }finally{if(server?.listening)await stop();rmSync(dir,{recursive:true,force:true});}
});
