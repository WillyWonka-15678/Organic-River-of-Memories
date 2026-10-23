import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {io} from 'socket.io-client';
import {openMessages} from './messages.mjs';
import {seedMessages} from './seed.mjs';
import {createMessageServer} from './realtime.mjs';
import {hashPassword,verifyPassword,tokenHash} from './auth.mjs';

test('admin login, persistent switch, transaction decisions, moderation events, CSRF, audit and sessions',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'river-admin-')),filename=join(dir,'messages.sqlite'),password=randomBytes(24).toString('base64url');
 let store=openMessages(filename),runtime,base,socket;
 const start=async()=>{runtime=createMessageServer(store);runtime.server.listen(0,'127.0.0.1');await once(runtime.server,'listening');base=`http://127.0.0.1:${runtime.server.address().port}`;};
 const stop=async()=>{socket?.disconnect();await new Promise(r=>runtime.io.close(r));store.close();};
 let cookie='',csrf='';
 const req=(path,method='GET',body,extra={})=>fetch(`${base}${path}`,{method,headers:{'Content-Type':'application/json',Origin:base,Cookie:cookie,'X-CSRF-Token':csrf,...extra},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
 const submit=content=>req('/api/messages','POST',{content});
 try{
  assert.equal(store.settings().autoApproveMessages,true);seedMessages(store);
  const hash=await hashPassword(password);assert.ok(!hash.includes(password));assert.equal(await verifyPassword(password,hash),true);
  store.createAdmin('管理员',hash);assert.throws(()=>store.createAdmin('覆盖',hash));await start();
  assert.equal((await req('/admin')).status,302);
  for(const path of ['/api/admin/messages','/api/admin/settings','/api/admin/stats','/api/admin/audit'])assert.equal((await req(path)).status,401);
  assert.equal((await req('/api/admin/settings','PATCH',{autoApproveMessages:false,expected:true})).status,401);
  assert.equal((await req('/api/admin/login','POST',{username:'管理员',password},{'X-Requested-With':'memory-admin',Origin:'https://evil.example'})).status,403);
  const login=await req('/api/admin/login','POST',{username:'管理员',password},{'X-Requested-With':'memory-admin'});
  assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/HttpOnly/i);assert.match(login.headers.get('set-cookie'),/SameSite=Strict/i);
  cookie=login.headers.get('set-cookie').split(';')[0];csrf=(await login.json()).csrf;
  assert.equal((await req('/admin')).status,200);assert.ok((await (await req('/api/admin/session')).json()).csrf);
  assert.equal((await req('/api/admin/settings','PATCH',{autoApproveMessages:false,expected:true},{'X-CSRF-Token':'forged'})).status,403);
  socket=io(base,{autoConnect:false});socket.connect();await once(socket,'connect');
  let event=once(socket,'message:approved');let first=await(await submit('自动批准')).json();assert.equal(first.status,'approved');assert.equal((await event)[0].record.id,first.id);
  const toggle=await req('/api/admin/settings','PATCH',{autoApproveMessages:false,expected:true});assert.equal(toggle.status,200);
  const pending=await(await submit('请人工审核')).json();assert.equal(pending.status,'pending');assert.equal(pending.message,'留言已提交，等待审核');
  assert.ok(!(await(await req('/api/display/messages')).json()).items.some(r=>r.id===pending.id));
  assert.equal((await req('/api/admin/settings','PATCH',{autoApproveMessages:true,expected:false})).status,200);
  assert.equal(store.list(1,100).items.find(r=>r.id===pending.id).status,'pending');
  event=once(socket,'message:approved');const approved=await req(`/api/admin/messages/${pending.id}/status`,'PATCH',{status:'approved',expected:'pending'});assert.equal(approved.status,200);assert.equal((await event)[0].record.id,pending.id);
  assert.equal((await req(`/api/admin/messages/${pending.id}/status`,'PATCH',{status:'approved',expected:'pending'})).status,409);
  event=once(socket,'message:removed');assert.equal((await req(`/api/admin/messages/${pending.id}/status`,'PATCH',{status:'hidden',expected:'approved'})).status,200);assert.equal((await event)[0].id,pending.id);
  event=once(socket,'message:approved');await req(`/api/admin/messages/${pending.id}/status`,'PATCH',{status:'approved',expected:'hidden'});await event;
  event=once(socket,'message:removed');await req(`/api/admin/messages/${pending.id}/status`,'PATCH',{status:'deleted',expected:'approved'});await event;
  assert.ok(!store.approved().some(r=>r.id===pending.id));
  const ordinary=await(await req('/api/admin/messages')).json();assert.ok(!ordinary.items.some(r=>r.id===pending.id));
  const deleted=await(await req('/api/admin/messages?status=deleted&q=请人工')).json();assert.equal(deleted.items[0].id,pending.id);
  const seeds=await(await req('/api/admin/messages?source=seed&limit=1&order=asc')).json();assert.equal(seeds.total,3);assert.equal(seeds.items.length,1);assert.equal(seeds.items[0].source,'seed');
  assert.equal((await req(`/api/admin/messages/seed:study-1/status`,'PATCH',{status:'hidden',expected:'approved'})).status,200);
  assert.equal((await req(`/api/admin/messages/seed:study-2/status`,'PATCH',{status:'deleted',expected:'approved'})).status,200);
  seedMessages(store);assert.ok(!store.approved().some(r=>['seed:study-1','seed:study-2'].includes(r.id)));
  const reject=await(await submit('拒绝测试')).json();assert.equal((await req(`/api/admin/messages/${reject.id}/status`,'PATCH',{status:'rejected',expected:'approved'})).status,400);
  await req('/api/admin/settings','PATCH',{autoApproveMessages:false,expected:true});
  const denied=await(await submit('待拒绝留言')).json();assert.equal((await req(`/api/admin/messages/${denied.id}/status`,'PATCH',{status:'rejected',expected:'pending'})).status,200);
  const audit=await(await req('/api/admin/audit')).json();assert.ok(audit.items.some(a=>a.action==='settings.autoApproveMessages'));assert.ok(audit.items.some(a=>a.action==='message.deleted'));
  await stop();store=openMessages(filename);assert.equal(store.settings().autoApproveMessages,false);seedMessages(store);await start();
  assert.equal((await req('/api/admin/settings')).status,200);assert.ok(!store.approved().some(r=>r.id===pending.id));
  // Two admin tabs acting on the same stale setting: exactly one succeeds.
  const concurrent=await Promise.all([req('/api/admin/settings','PATCH',{autoApproveMessages:true,expected:false}),req('/api/admin/settings','PATCH',{autoApproveMessages:true,expected:false})]);
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
  const raw=new DatabaseSync(filename);raw.prepare('UPDATE sessions SET expiresAt=0 WHERE tokenHash=?').run(tokenHash(cookie.split('=')[1]));raw.close();
  assert.equal((await req('/api/admin/settings')).status,401);
 }finally{if(runtime?.server.listening)await stop();rmSync(dir,{recursive:true,force:true});}
});

test('production cookie is Secure; logout revokes session and CSRF blocks cross-origin writes',async()=>{
 const previous=process.env.NODE_ENV;process.env.NODE_ENV='production';
 const store=openMessages(':memory:');const password='a';
 let runtime;
 try{
  store.createAdmin('admin',await hashPassword(password));runtime=createMessageServer(store);runtime.server.listen(0,'127.0.0.1');await once(runtime.server,'listening');
  const base=`http://127.0.0.1:${runtime.server.address().port}`;
  const login=await fetch(`${base}/api/admin/login`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,'X-Requested-With':'memory-admin'},body:JSON.stringify({username:'admin',password})});
  assert.match(login.headers.get('set-cookie'),/; Secure/i);const cookie=login.headers.get('set-cookie').split(';')[0],csrf=(await login.json()).csrf;
  const headers={'Content-Type':'application/json',Origin:'https://evil.example',Cookie:cookie,'X-CSRF-Token':csrf};
  assert.equal((await fetch(`${base}/api/admin/settings`,{method:'PATCH',headers,body:JSON.stringify({autoApproveMessages:false,expected:true})})).status,403);
  headers.Origin=base;assert.equal((await fetch(`${base}/api/admin/logout`,{method:'POST',headers,body:'{}'})).status,200);
  assert.equal((await fetch(`${base}/api/admin/settings`,{headers:{Cookie:cookie}})).status,401);
 }finally{if(runtime)await new Promise(r=>runtime.io.close(r));store.close();if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
});

test('stage 3 migration preserves rows, snapshots backup, persistent defaults; login rate/expiry/security',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'river-upgrade-')),filename=join(dir,'messages.sqlite');
 let store;
 try{
  const old=new DatabaseSync(filename);old.exec("CREATE TABLE messages(id TEXT PRIMARY KEY,name TEXT NOT NULL,major TEXT NOT NULL,year INTEGER NOT NULL,content TEXT NOT NULL,createdAt TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','approved','hidden','rejected')),source TEXT NOT NULL,sourceKey TEXT,UNIQUE(source,sourceKey)); INSERT INTO messages VALUES('old','真实昵称','专业',2026,'原文','2026-10-01','hidden','user',NULL);");old.close();
  store=openMessages(filename);assert.ok(existsSync(`${filename}.pre-stage4.bak`));assert.equal(store.list(1,10).items[0].status,'hidden');assert.equal(store.settings().autoApproveMessages,true);
  store.changeSetting(false,'test');store.close();store=openMessages(filename);assert.equal(store.settings().autoApproveMessages,false);
  const password=randomBytes(24).toString('hex');store.createAdmin('admin',await hashPassword(password));
  const runtime=createMessageServer(store);runtime.server.listen(0,'127.0.0.1');await once(runtime.server,'listening');
  const base=`http://127.0.0.1:${runtime.server.address().port}`;
  try{
   for(let i=0;i<5;i++)assert.equal((await fetch(`${base}/api/admin/login`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,'X-Requested-With':'memory-admin'},body:JSON.stringify({username:'admin',password:'incorrect'})})).status,401);
   assert.equal((await fetch(`${base}/api/admin/login`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,'X-Requested-With':'memory-admin'},body:JSON.stringify({username:'admin',password})})).status,429);
  }finally{await new Promise(r=>runtime.io.close(r));}
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});

