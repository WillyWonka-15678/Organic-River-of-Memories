import {DatabaseSync,backup} from 'node:sqlite';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {createInterface} from 'node:readline/promises';
import {defaultDatabase} from './messages.mjs';
import {activeLock,lockDatabase} from './service-lock.mjs';
import {backupDatabase} from './backup.mjs';
import {runtimeConfig} from './config.mjs';
const source=resolve(process.argv[2]||''),target=runtimeConfig().databasePath;
let release;
try{
 if(!process.argv[2]||!existsSync(source)||source===target)throw Error('请指定一个与正式数据库不同的现有备份文件。');
 if(activeLock(target))throw Error('请先停止展览服务器再恢复。');
 if(!process.stdin.isTTY)throw Error('恢复必须由用户在交互终端明确确认，不接受静默覆盖。');
 const db=new DatabaseSync(source,{readOnly:true});
 try{
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('备份完整性检查失败');
  for(const name of ['messages','settings','admin'])if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name))throw Error(`备份缺少 ${name} 表`);
  const terminal=createInterface({input:process.stdin,output:process.stdout});
  let reply;try{reply=await terminal.question(`将用 ${source} 恢复 ${target}，请确认服务器已停止。输入 RESTORE 确认：`);}finally{terminal.close();}
  if(reply!=='RESTORE')throw Error('已取消，未改动正式数据库。');
  if(activeLock(target))throw Error('服务重新启动，拒绝恢复。');
  release=lockDatabase(target);
  if(existsSync(target))console.log(`恢复前安全副本：${await backupDatabase(target,runtimeConfig().backupDir)}`);
  await backup(db,target);
  const restored=new DatabaseSync(target);try{restored.exec('DELETE FROM sessions;');}finally{restored.close();}
  console.log('恢复完成。管理员账号及审核设置保留；旧会话已清除，请重新登录。');
 }finally{db.close();}
}catch(e){console.error(e.message);process.exitCode=1;}finally{release?.();}
