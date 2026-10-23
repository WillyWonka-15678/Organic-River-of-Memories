import { openMessages } from './messages.mjs';
if(process.env.NODE_ENV!=='development'){console.error('仅允许 NODE_ENV=development；请明确指定待批准留言 ID。');process.exit(1);}
const ids=process.argv.slice(2);
if(!ids.length){console.error('用法：npm.cmd run messages:approve -- <ID> [ID...]；不提供批量批准所有功能。');process.exit(1);}
const store=openMessages();try{for(const id of ids)console.log(`${id}: 批准 ${store.approve(id)} 条`);}finally{store.close();}
console.log('大屏将在下次同步（至多约 30 秒）或重连时读取批准结果。');
