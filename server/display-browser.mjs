// Isolated end-to-end validation. Never touches the exhibition database or port 3000.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createServer as createNetServer} from 'node:net';
const probe=createNetServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const vitePort=probe.address().port;await new Promise(r=>probe.close(r));
import {randomBytes} from 'node:crypto';
import {hashPassword} from './auth.mjs';
import {openMessages} from './messages.mjs';
import {seedMessages} from './seed.mjs';
import {createMessageServer} from './realtime.mjs';
const dir=mkdtempSync(join(tmpdir(),'river-browser-')),file=join(dir,'messages.sqlite');
let store=openMessages(file);seedMessages(store);
const password=randomBytes(24).toString('base64url');store.createAdmin('browser-admin',await hashPassword(password));
let runtime=createMessageServer(store);runtime.server.listen(0,'127.0.0.1');await once(runtime.server,'listening');
const apiPort=runtime.server.address().port;
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(vitePort),'--strictPort'],{env:{...process.env,MEMORY_API_TARGET:`http://127.0.0.1:${apiPort}`},stdio:'pipe',windowsHide:true});
let viteLog='';vite.stdout.on('data',c=>viteLog+=c);vite.stderr.on('data',c=>viteLog+=c);
let browser;
const wait=async(fn,ms=30000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error(`Timeout: ${viteLog}`);};
async function stopRuntime(){await new Promise(r=>runtime.io.close(r));store.close();}
try{
 await wait(async()=>{try{return (await fetch(`http://127.0.0.1:${vitePort}`)).ok;}catch{return false;}});
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${vitePort}/?camera=off&stage=4&qa=1`);
 const network=()=>page.evaluate(()=>(window).__riverQA?.memoryNetwork());
 await wait(async()=>{const s=await network();return s?.connected&&s.pool.length===3;});
 await wait(()=>page.evaluate(()=>(window).__riverQA.memoryState().length===36));
 assert.ok((await page.evaluate(()=>(window).__riverQA.memoryState())).every(m=>m.record.id.startsWith('seed:')));
 mkdirSync('test-results',{recursive:true});
 await page.screenshot({path:'test-results/memory-dense-opening.png'});
 // Hold the queue while filling the phone form; dense defaults otherwise consume it first.
 await page.evaluate(()=>(window).__riverQA.memoryTiming(60));
 const phone=await browser.newPage({viewport:{width:390,height:844}});
 await phone.goto(`http://127.0.0.1:${apiPort}/submit`);await phone.locator('#name').fill('实时测试同学');await phone.locator('#content').fill('第三阶段实时记忆');
 await phone.getByRole('button',{name:'送出这段记忆'}).click();await phone.getByText('你的记忆已送达，请抬头看看大屏',{exact:true}).waitFor();
 await wait(async()=>(await network()).queue.length===1);
 const liveId=(await network()).queue[0];
 await page.evaluate(()=>{(window).__riverQA.clearMemories();(window).__riverQA.memoryTiming(.5);});
 await wait(()=>page.evaluate(id=>(window).__riverQA.memoryState().some(m=>m.record.id===id&&m.x<0),liveId));
 // Saved SQL records survive taking a visual queue entry.
 assert.ok(store.approved().some(r=>r.id===liveId));
 await wait(()=>page.evaluate(id=>(window).__riverQA.memoryState().some(m=>m.record.id===id&&m.x>.18),liveId),30000);
 mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/database-live-memory.png'});
 const before=await page.evaluate(()=>(window).__river.frames);
 await stopRuntime();
 await wait(async()=>(await network()).connected===false);
 await wait(()=>page.evaluate(f=>(window).__river.frames>f+12,before));assert.ok((await network()).pool.length===4);
 store=openMessages(file);const missed=store.save({name:'断线测试',major:'',year:2026,content:'断线期间新增记忆'},'approved');store.hide('seed:study-1');
 runtime=createMessageServer(store);runtime.server.listen(apiPort,'127.0.0.1');await once(runtime.server,'listening');
 await wait(async()=>{const n=await network();return n.connected&&n.pool.some(r=>r.id===missed.id)&&!n.pool.some(r=>r.id==='seed:study-1');});
 assert.ok(store.approved().some(r=>r.id===liveId));
 const admin=await browser.newPage({viewport:{width:1280,height:900}});admin.on('pageerror',e=>errors.push(e.message));
 await admin.goto(`http://127.0.0.1:${apiPort}/admin`);assert.ok(admin.url().endsWith('/admin/login'));
 await admin.locator('#username').fill('browser-admin');await admin.locator('#password').fill(password);await admin.getByRole('button',{name:'登录',exact:true}).click();
 await admin.getByText('自动审核已开启',{exact:true}).waitFor();
 await admin.getByRole('button',{name:'关闭自动审核',exact:true}).click();await admin.getByText('自动审核已关闭，新留言需要人工审核',{exact:true}).waitFor();
 await phone.locator('#content').fill('第四阶段人工审核测试');await phone.getByRole('button',{name:'送出这段记忆'}).click();await phone.getByText('留言已提交，等待审核',{exact:true}).waitFor();
 const pending=store.list(1,100).items.find(r=>r.content==='第四阶段人工审核测试');assert.equal(pending.status,'pending');assert.ok(!(await network()).pool.some(r=>r.id===pending.id));
 await admin.locator('select[name=status]').selectOption('pending');await admin.locator('input[name=q]').fill('第四阶段人工审核测试');await admin.getByRole('button',{name:'查询 / 刷新',exact:true}).click();
 await admin.locator('article').filter({hasText:pending.id}).getByRole('button',{name:'通过',exact:true}).click();await wait(async()=>(await network()).pool.some(r=>r.id===pending.id));
 const backlog=store.save({name:'',major:'',year:2026,content:'重新开启不自动批准的待审核记录'});
 await admin.getByRole('button',{name:'开启自动审核',exact:true}).click();await admin.getByText('自动审核已开启',{exact:true}).waitFor();assert.equal(store.list(1,100).items.find(r=>r.id===backlog.id).status,'pending');
 // Capture a real database instance using the existing Pose QA input before withdrawing it.
 await page.evaluate(id=>{
  const w=window,m=w.__riverQA.memoryState().find(v=>v.record.id===id);if(!m)throw Error('Missing live instance');
  const x=m.x,y=m.y;
  w.adminPose=setInterval(()=>{const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:0,presence:1}));for(const [i,px] of [[11,Math.min(.9,x+.3)],[12,Math.min(.99,x+.42)],[13,x+.15],[15,x]])p[i]={x:px,y:1-y,visibility:.95,presence:1};w.__riverQA.injectPose(p);},65);
 },liveId);
 await wait(()=>page.evaluate(()=>(window).__riverQA.memoryState().some(m=>m.state==='CAPTURED')));
 const captured=await page.evaluate(()=>(window).__riverQA.memoryState().find(m=>m.state==='CAPTURED').record);
 await admin.locator('select[name=status]').selectOption('approved');await admin.locator('input[name=q]').fill(captured.message);await admin.getByRole('button',{name:'查询 / 刷新',exact:true}).click();
 admin.once('dialog',dialog=>dialog.accept());await admin.locator('article').filter({hasText:captured.id}).getByRole('button',{name:'隐藏',exact:true}).click();
 await wait(async()=>!(await network()).pool.some(r=>r.id===captured.id));
 await wait(()=>page.evaluate(id=>!(window).__riverQA.memoryState().some(m=>m.record.id===id),captured.id));
 await page.evaluate(()=>{clearInterval((window).adminPose);(window).__riverQA.clearPose();});
 assert.ok(!(await network()).queue.includes(captured.id));assert.equal(store.list(1,100).items.find(r=>r.id===captured.id).status,'hidden');
 await admin.locator('input[name=q]').fill('');await admin.locator('select[name=status]').selectOption('');await admin.getByRole('button',{name:'查询 / 刷新',exact:true}).click();await admin.locator('article').first().waitFor();
 await admin.screenshot({path:'test-results/admin-desktop.png',fullPage:true});await admin.setViewportSize({width:390,height:844});await admin.screenshot({path:'test-results/admin-mobile.png',fullPage:true});
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: SQLite startup/live flow/restart, administrator login/toggle/pending submission/manual approval, real captured-instance hiding and removal, responsive admin pages.');
}finally{
 if(browser)await browser.close();
 vite.kill();await stopRuntime();rmSync(dir,{recursive:true,force:true});
}
