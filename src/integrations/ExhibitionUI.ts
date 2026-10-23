import type {MemorySync} from './MemorySync';
export interface DisplaySettings {submitUrl:string;serverUrl:string;showQr:boolean;exhibitionMode:boolean}
export const displaySettings:DisplaySettings=(window as Window &{__EXHIBITION_CONFIG__?:DisplaySettings}).__EXHIBITION_CONFIG__||{submitUrl:'',serverUrl:'',showQr:false,exhibitionMode:false};
export function exhibitionUI(sync:MemorySync){
 document.body.classList.toggle('exhibition',displaySettings.exhibitionMode);
 const panel=document.createElement('section');panel.id='entry-qr';panel.setAttribute('aria-label','手机寄语入口');
 const link=document.createElement('a'),image=document.createElement('img');image.alt='扫码打开毕业寄语提交页面';image.width=144;image.height=144;link.append(image);
 const title=document.createElement('strong');title.textContent='扫码留下寄语';const subtitle=document.createElement('small');subtitle.textContent='让记忆汇入河流';panel.append(title,link,subtitle);document.body.append(panel);
 const debug=document.createElement('pre');debug.id='network-debug';document.body.append(debug);
 const apply=(c:DisplaySettings)=>{panel.hidden=!c.showQr||!c.submitUrl;link.href=c.submitUrl;image.src=`/api/entry-qr.svg?t=${Date.now()}`;};apply(displaySettings);
 const clock=setInterval(()=>{debug.textContent=`服务器：${sync.state}\n留言池：${sync.pool.records.size} · 待入场：${sync.pool.queue.length}\n最近同步：${sync.lastSyncTime?new Date(sync.lastSyncTime).toLocaleTimeString():'尚未同步'}`;},1000);
 const refresh=setInterval(()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3000);void fetch('/api/public-config',{signal:controller.signal,cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(apply).catch(()=>{}).finally(()=>clearTimeout(timer));},30000);
 return ()=>{clearInterval(clock);clearInterval(refresh);panel.remove();debug.remove();};
}
