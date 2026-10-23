const $=id=>document.getElementById(id),form=$('filters');
let csrf='',setting, page=1,total=0,busy=false,sequence=0;
const names={pending:'待审核',approved:'已通过',hidden:'已隐藏',rejected:'已拒绝',deleted:'已删除'};
async function api(path,options={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(`/api/admin/${path}`,{...options,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,...options.headers},signal:controller.signal});
  if(response.status===401){location.assign('/admin/login');throw new Error('会话已过期');}
  const result=await response.json();if(!response.ok)throw new Error(result.message||`HTTP ${response.status}`);return result;
 }catch(error){if(error.name==='AbortError')throw new Error('请求超时，结果尚未确认，请刷新核对后再操作。');throw error;}finally{clearTimeout(timer);}
}
function node(tag,text,className){const n=document.createElement(tag);n.textContent=text;if(className)n.className=className;return n;}
function controls(){for(const button of document.querySelectorAll('button'))button.disabled=busy; $('prev').disabled=busy||page<=1;$('next').disabled=busy||page*20>=total;$('toggle').disabled=busy||typeof setting!=='boolean';}
async function refresh(){
 const current=++sequence;const query=new URLSearchParams(new FormData(form));query.set('page',String(page));query.set('limit','20');
 const [settings,stats,list]=await Promise.all([api('settings'),api('stats'),api(`messages?${query}`)]);
 if(current!==sequence)return;
 setting=settings.autoApproveMessages;total=list.total;
 if(page>1&&(page-1)*20>=total){page=Math.max(1,Math.ceil(total/20));return refresh();}
 $('mode').textContent=setting?'自动审核已开启':'自动审核已关闭，新留言需要人工审核';$('toggle').textContent=setting?'关闭自动审核':'开启自动审核';
 $('stats').replaceChildren(...[['留言总数',stats.total],['已通过',stats.approved],['待审核',stats.pending],['已隐藏',stats.hidden]].map(([label,value])=>{const n=node('p',label);n.append(node('b',value));return n;}));
 const cards=list.items.map(row=>{
  const article=node('article','','message');article.append(node('p',`ID：${row.id}`,'muted'),node('p',`${row.name||'未署名'} · ${row.major||'未填专业'} · ${row.year}`),node('p',row.content,'content'),node('p',`${new Date(row.createdAt).toLocaleString()} · ${row.source==='seed'?'原有模拟留言':'手机提交'} · ${names[row.status]}`,'muted'));
  const actions=node('div','','actions');const options={pending:[['通过','approved'],['拒绝','rejected']],approved:[['隐藏','hidden']],hidden:[['恢复','approved']],rejected:[],deleted:[]};
  const buttons=[...options[row.status]];if(row.status!=='deleted')buttons.push(['删除','deleted']);
  for(const [label,status] of buttons){const button=node('button',label,status==='approved'?'primary':'danger');button.type='button';button.addEventListener('click',()=>{
   if(busy)return;if(status!=='approved'&&!confirm(`确认${label}这条留言？\n${row.content}`))return;
   void mutate(()=>api(`messages/${encodeURIComponent(row.id)}/status`,{method:'PATCH',body:JSON.stringify({status,expected:row.status})}),`留言已${label}`);
  });actions.append(button);}article.append(actions);return article;
 });
 $('messages').replaceChildren(...(cards.length?cards:[node('p','没有符合条件的留言。','muted')]));
 $('pageInfo').textContent=`第 ${page} 页 / 共 ${Math.max(1,Math.ceil(total/20))} 页 · ${total} 条`;controls();
}
async function mutate(action,success){
 if(busy)return;busy=true;sequence++;controls();$('feedback').textContent='正在保存…';
 try{await action();await refresh();$('feedback').textContent=success;}
 catch(error){$('feedback').textContent=error.message;try{await refresh();}catch{/* Keep the explicit error until a successful manual refresh. */}}
 finally{busy=false;controls();}
}
$('toggle').addEventListener('click',()=>{if(typeof setting==='boolean')void mutate(()=>api('settings',{method:'PATCH',body:JSON.stringify({autoApproveMessages:!setting,expected:setting})}),'审核设置已保存');});
form.addEventListener('submit',event=>{event.preventDefault();if(busy)return;page=1;void refresh().catch(error=>$('feedback').textContent=error.message);});
for(const [id,delta] of [['prev',-1],['next',1]])$(id).addEventListener('click',()=>{if(busy)return;page+=delta;void refresh().catch(error=>$('feedback').textContent=error.message);});
$('logout').addEventListener('click',()=>void mutate(async()=>{await api('logout',{method:'POST',body:'{}'});location.assign('/admin/login');},'已退出'));
async function start(){try{csrf=(await api('session')).csrf;await refresh();}catch(error){$('feedback').textContent=error.message;}}
void start();setInterval(()=>{if(!busy&&document.visibilityState==='visible')void refresh().catch(error=>$('feedback').textContent=error.message);},10000);
