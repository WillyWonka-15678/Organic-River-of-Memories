import {DatabaseSync,backup} from 'node:sqlite';
import {mkdir,chmod,readdir,stat,unlink,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {defaultDatabase} from './messages.mjs';
import {runtimeConfig} from './config.mjs';
export async function backupDatabase(source,targetDir){
 const filename=resolve(source);const db=new DatabaseSync(filename,{readOnly:true});
 await mkdir(targetDir,{recursive:true,mode:0o700});
 const target=join(targetDir,`memory-river-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID()}.sqlite`);
 let created=false;
 try{
  await writeFile(target,'',{flag:'wx',mode:0o600});created=true;
  await backup(db,target);await chmod(target,0o600);
  const check=new DatabaseSync(target,{readOnly:true});try{if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('备份完整性校验失败');}finally{check.close();}
  return target;
 }catch(error){if(created)await unlink(target).catch(()=>{});throw error;}finally{db.close();}
}
export async function pruneBackups(dir,days){
 const files=(await readdir(dir)).filter(n=>/^memory-river-.*\.sqlite$/.test(n));
 const ordered=await Promise.all(files.map(async n=>({name:n,mtime:(await stat(join(dir,n))).mtimeMs})));
 ordered.sort((a,b)=>b.mtime-a.mtime);
 for(const f of ordered.slice(1))if(Date.now()-f.mtime>days*86400000)await unlink(join(dir,f.name));
}
export function scheduleBackups(config,source=process.env.DATABASE_PATH||defaultDatabase){
 let busy=false;const run=async()=>{if(busy)return;busy=true;try{const path=await backupDatabase(source,config.backupDir);await pruneBackups(config.backupDir,config.retentionDays);console.log(`数据库备份成功：${path}`);}catch(e){console.error('数据库备份失败：',e.message);}finally{busy=false;}};
 const timer=config.backupMinutes?setInterval(run,config.backupMinutes*60000):null;timer?.unref();
 return {run,stop:()=>{if(timer)clearInterval(timer);}};
}
if(process.argv[1]&&import.meta.url===(await import('node:url')).pathToFileURL(process.argv[1]).href){
 try{const c=runtimeConfig();console.log(await backupDatabase(c.databasePath,c.backupDir));await pruneBackups(c.backupDir,c.retentionDays);}catch(e){console.error(e.message);process.exitCode=1;}
}
