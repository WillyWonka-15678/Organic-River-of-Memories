import {networkInterfaces} from 'node:os';
import {createServer} from 'node:http';
import {createMessageServer} from './realtime.mjs';
import {createApp} from './app.mjs';
import {openMessages} from './messages.mjs';
import {seedMessages} from './seed.mjs';
import {runtimeConfig} from './config.mjs';
import {scheduleBackups} from './backup.mjs';
import {lockDatabase} from './service-lock.mjs';
const runtime=runtimeConfig(),port=runtime.port;
let store,io,server,backups;let unlock=()=>{};
if(runtime.displayOnly){server=createServer(createApp());}
else{
 store=openMessages();unlock=lockDatabase(runtime.databasePath);seedMessages(store);
 ({server,io}=createMessageServer(store));
 if(process.env.AUTO_APPROVE_MESSAGES!==undefined)console.warn('AUTO_APPROVE_MESSAGES 已停用；审核开关只读取 SQLite，请在 /admin 修改。');
}
server.listen(port,'0.0.0.0',()=>{
 if(store)backups=scheduleBackups(runtime,runtime.databasePath);
 console.log(`展览大屏：http://localhost:${port}/display\n手机入口：${runtime.submitUrl||'暂无网络地址，二维码暂不可用'}`);
 if(store){console.log(`自动审核：${store.settings().autoApproveMessages?'开启':'关闭，新留言待审核'}（SQLite 持久化设置）`);console.log(`管理员：http://localhost:${port}/admin${store.adminAccount()?'':'（请先运行 npm.cmd run admin:init 初始化账号）'}`);}
 else console.log('现场大屏仅加载远程已批准留言，不打开本地数据库。管理员请访问远程域名 /admin。');
 console.log(`连接测试：http://localhost:${port}/test`);
 for(const [name,addresses] of Object.entries(networkInterfaces()))for(const a of addresses||[])if(a.family==='IPv4'&&!a.internal&&!a.address.startsWith('169.254.'))console.log(`局域网候选 [${name}]：http://${a.address}:${port}/submit`);
 console.log('请选择连接手机热点的 Wi-Fi 网卡地址；使用 ipconfig 核对 IPv4。');
});
server.on('error',error=>{unlock();backups?.stop();store?.close();console.error(error.code==='EADDRINUSE'?`端口 ${port} 已占用，请停止旧服务或设置其他 PORT。`:error.message);process.exitCode=1;});
process.once('exit',unlock);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{backups?.stop();const done=()=>{store?.close();unlock();process.exit(0);};if(io)io.close(done);else server.close(done);});
