import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {runtimeConfig,root} from '../server/config.mjs';
const c=runtimeConfig();
const probe=createServer();
try{await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(c.port,'0.0.0.0',()=>probe.close(resolve));});}
catch{console.error(`端口 ${c.port} 已占用；未重复启动。请先停止原服务，或直接使用已有 /display 页面。`);process.exit(1);}
for(const args of [['scripts/build-worker.mjs'],['node_modules/typescript/bin/tsc','--noEmit']]){const r=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',windowsHide:true});if(r.status!==0)process.exit(r.status||1);}
const built=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{cwd:root,stdio:'inherit',windowsHide:true});
if(built.status!==0)process.exit(built.status||1);
const env={...process.env,EXHIBITION_MODE:'true'};
const server=spawn(process.execPath,['server/index.mjs'],{cwd:root,env,stdio:'inherit',windowsHide:true});
const url=`http://localhost:${c.port}/display`;
const deadline=setTimeout(()=>{console.error('展览服务启动超时，请查看启动日志。');server.kill();},30000);
const timer=setInterval(async()=>{try{
 const r=await fetch(`http://localhost:${c.port}/api/health`,{signal:AbortSignal.timeout(1500)});if(!r.ok)return;
 clearInterval(timer);clearTimeout(deadline);console.log(`大屏已就绪：${url}`);
 if(process.env.OPEN_BROWSER!=='false'&&process.platform==='win32'){
  const browser=spawn('powershell.exe',['-NoProfile','-Command',`Start-Process msedge -ArgumentList '--new-window','--start-fullscreen','${url}'`],{windowsHide:true,stdio:'inherit'});
  browser.on('error',e=>console.error('浏览器打开失败，请手动打开大屏地址：',e.message));
 }
 }catch{}},500);
server.on('error',e=>{clearInterval(timer);clearTimeout(deadline);console.error(e.message);process.exitCode=1;});
server.on('exit',code=>{clearInterval(timer);clearTimeout(deadline);process.exitCode=code||0;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);server.kill(signal);});

