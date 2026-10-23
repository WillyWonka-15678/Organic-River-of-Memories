const form=document.querySelector('#login'),error=document.querySelector('#error'),button=form.querySelector('button');
form.addEventListener('submit',async event=>{
 event.preventDefault();if(button.disabled)return;button.disabled=true;error.textContent='正在登录…';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'memory-admin'},body:JSON.stringify(Object.fromEntries(new FormData(form))),signal:controller.signal});
  const result=await response.json();if(!response.ok)throw new Error(result.message||'登录失败');
  location.assign('/admin');
 }catch(cause){error.textContent=cause.name==='AbortError'?'登录超时，请重试。':cause.message;}
 finally{clearTimeout(timer);button.disabled=false;}
});
