import {runtimeConfig} from '../server/config.mjs';
const c=runtimeConfig(),base=`http://localhost:${c.port}`;
try{
 for(const path of ['/api/health','/api/display/messages','/api/public-config','/submit','/display']){
  const r=await fetch((c.displayOnly&&path==='/api/display/messages'?c.serverUrl:base)+path,{signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error(`${path}: HTTP ${r.status}`);
  if(path==='/api/health'&&!(await r.json()).ok)throw Error('健康检查失败');console.log(`通过 ${path}`);
 }
 console.log(`手机入口：${c.submitUrl}；二维码真实手机扫码和摄像头仍需人工验收。`);
}catch(e){console.error(e.message);process.exitCode=1;}
