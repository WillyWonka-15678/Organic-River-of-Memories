import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {openMessages} from './messages.mjs';
import {hashPassword} from './auth.mjs';
if(!process.stdin.isTTY){console.error('请在本机交互终端运行初始化；不接受命令行或环境变量传递明文密码。');process.exit(1);}
let muted=false;
const output=new Writable({write(chunk,_encoding,done){if(!muted)process.stdout.write(chunk);done();}});
const terminal=createInterface({input:process.stdin,output,terminal:true});
let closing=false;
const controller=new AbortController();terminal.on('SIGINT',()=>controller.abort());
terminal.on('error',error=>{if(closing&&error.code==='EPERM'&&error.syscall==='setRawMode'){console.warn('此终端无法恢复输入模式，账号处理结果不受影响；请关闭该终端窗口。');return;}controller.abort();});
const hidden=async prompt=>{process.stdout.write(prompt);muted=true;try{return await terminal.question('',{signal:controller.signal});}finally{muted=false;process.stdout.write('\n');}};
const store=openMessages();
try{
 if(store.adminAccount())throw new Error('管理员已经存在，本初始化不会覆盖账号或密码。');
 const username=(await terminal.question('管理员用户名（1–40 字符）：',{signal:controller.signal})).trim();
 if(!username||[...username].length>40||/[\x00-\x1f]/.test(username))throw new Error('用户名不合法');
 const password=await hidden('设置密码（不显示，可自由设置，不能为空）：');
 const repeat=await hidden('再次输入密码：');if(password!==repeat)throw new Error('两次密码不一致');
 store.createAdmin(username,await hashPassword(password));console.log('管理员创建成功。请启动服务后访问 /admin 登录。');
}catch(error){console.error(error.name==='AbortError'?'初始化已取消':error.message);process.exitCode=1;}
finally{closing=true;terminal.close();process.stdin.pause();process.stdin.unref?.();store.close();process.stdout.write("",()=>process.exit(process.exitCode||0));}




