import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,utimes,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {DatabaseSync,backup} from 'node:sqlite';
import {PNG} from 'pngjs';
import jsQR from 'jsqr';
import {runtimeConfig} from './config.mjs';
import {exportQr} from './entry.mjs';
import {backupDatabase,pruneBackups,scheduleBackups} from './backup.mjs';
import {openMessages} from './messages.mjs';
import {seedMessages} from './seed.mjs';
import {createMessageServer} from './realtime.mjs';
import {hashPassword,verifyPassword} from './auth.mjs';
test('real reachable LAN URL exports decodable high resolution PNG/SVG; private paths stay private',async()=>{
 const store=openMessages(':memory:'),runtime=createMessageServer(store),dir=await mkdtemp(join(tmpdir(),'river-qr-'));
 runtime.server.listen(0,'0.0.0.0');await once(runtime.server,'listening');
 try{
  const port=runtime.server.address().port,c=runtimeConfig({PORT:String(port)});
  await exportQr(c,dir);
  const png=PNG.sync.read(await readFile(join(dir,'submit-qr.png')));assert.equal(png.width,2400);
  const decoded=jsQR(new Uint8ClampedArray(png.data),png.width,png.height);assert.equal(decoded.data,c.submitUrl);
  assert.match(await readFile(join(dir,'submit-qr.svg'),'utf8'),/<svg/);
  assert.throws(()=>runtimeConfig({NETWORK_MODE:'public',PUBLIC_SUBMIT_URL:'http://example.com/submit'}));
  assert.throws(()=>runtimeConfig({BACKUP_DIR:'dist'}));
  assert.equal(runtimeConfig({SHOW_QR:'false'}).showQr,false);
  const base=`http://127.0.0.1:${port}`;
  for(const path of ['/data/messages.sqlite','/backups/a.sqlite','/server/messages.mjs','/config/exhibition.local.json'])assert.equal((await fetch(base+path)).status,404);
  assert.equal((await fetch(base+'/api/entry-qr.svg')).status,200);
  assert.equal((await fetch(base+'/display')).status,200);
 }finally{await new Promise(r=>runtime.io.close(r));store.close();await rm(dir,{recursive:true,force:true});}
});
test('online SQLite backup independently restores messages, tombstones, settings/admin and retains newest backup',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'river-backup-')),file=join(dir,'live.sqlite'),out=join(dir,'backups');let store=openMessages(file);
 const password='backup-test';
 try{
  seedMessages(store);store.createAdmin('backup-admin',await hashPassword(password));store.changeSetting(false,'test');
  const row=store.submit({name:'中文',major:'专业',year:2026,content:'恢复验证'});store.moderate('seed:study-1','deleted','approved','test');
  const first=await backupDatabase(file,out);store.save({name:'',major:'',year:2026,content:'备份之后新增'});
  const second=await backupDatabase(file,out),restored=join(dir,'restored.sqlite');
  const dirty=openMessages(restored);dirty.save({name:'',major:'',year:2026,content:'旧目标内容，应被测试恢复替换'});dirty.close();
  const db=new DatabaseSync(first,{readOnly:true});try{await backup(db,restored);}finally{db.close();}
  const clone=openMessages(restored);try{
   assert.equal(clone.settings().autoApproveMessages,false);assert.equal(clone.list(1,100).total,4);
   assert.equal(clone.list(1,100).items.find(m=>m.id===row.id).status,'pending');
   assert.equal(clone.list(1,100).items.find(m=>m.id==='seed:study-1').status,'deleted');
   assert.equal(await verifyPassword(password,clone.adminAccount().passwordHash),true);
  }finally{clone.close();}
  const old=new Date(Date.now()-40*86400000);await utimes(first,old,old);await pruneBackups(out,14);await assert.rejects(()=>access(first));await access(second);
  const scheduler=scheduleBackups({backupMinutes:0,backupDir:out,retentionDays:14},file);await scheduler.run();scheduler.stop();
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
});
