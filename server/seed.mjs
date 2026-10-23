import { studyMemories } from '../src/memories/MemoryRecord.ts';
import { openMessages } from './messages.mjs';
export function seedMessages(store){
  const result=store.seed(studyMemories);
  console.log(`模拟留言 ${result.total} 条；新增 ${result.added}；已存在跳过 ${result.skipped}；手机历史 ${result.userHistory} 条`);
  return result;
}
if(process.argv[1]&&import.meta.url===(await import('node:url')).pathToFileURL(process.argv[1]).href){
  const store=openMessages();try{seedMessages(store);}finally{store.close();}
}
