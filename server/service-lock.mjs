import {existsSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
export function activeLock(database){
 const path=`${resolve(database)}.service-lock`;
 if(!existsSync(path))return false;
 const pid=JSON.parse(readFileSync(path,'utf8')).pid;
 try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}
}
export function lockDatabase(database){
 const path=`${resolve(database)}.service-lock`;
 if(activeLock(database))throw Error('数据库服务已在运行，请停止旧服务后再启动。');
 if(existsSync(path))unlinkSync(path);
 writeFileSync(path,JSON.stringify({pid:process.pid}),{flag:'wx',mode:0o600});
 return ()=>{if(existsSync(path)&&JSON.parse(readFileSync(path,'utf8')).pid===process.pid)unlinkSync(path);};
}
