import {Router} from 'express';
import {fileURLToPath} from 'node:url';
import {cookieToken,sessionCookie,tokenHash,verifyPassword,makeSession,sameOrigin} from './auth.mjs';
const statuses=['pending','approved','hidden','rejected','deleted'];
export function installAdmin(app,store,{publishApproved,publishRemoved}){
 const root=fileURLToPath(new URL('./public/',import.meta.url));
 const secure=process.env.NODE_ENV==='production';
 const cookie={httpOnly:true,sameSite:'strict',secure,path:'/',maxAge:8*3600000};
 const user=req=>{const token=cookieToken(req);return token&&store.session(tokenHash(token));};
 app.use(['/admin','/api/admin'],(_req,res,next)=>{res.set({'Cache-Control':'no-store','X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});next();});
 app.get('/admin/login',(_req,res)=>res.sendFile(`${root}admin-login.html`));
 app.get('/admin/admin.css',(_req,res)=>res.sendFile(`${root}admin.css`));
 app.get('/admin/login.js',(_req,res)=>res.sendFile(`${root}admin-login.js`));
 app.get('/admin', (req,res)=>user(req)?res.sendFile(`${root}admin.html`):res.redirect('/admin/login'));
 app.get('/admin/admin.js',(req,res)=>user(req)?res.sendFile(`${root}admin.js`):res.status(401).end());
 app.post('/api/admin/login',async(req,res,next)=>{
  try{
   if(!sameOrigin(req)||req.get('X-Requested-With')!=='memory-admin')return res.status(403).json({ok:false,message:'登录请求来源不合法'});
   const {username,password}=req.body||{};
   if(typeof username!=='string'||username.length>80||typeof password!=='string'||Buffer.byteLength(password)>256)return res.status(400).json({ok:false,message:'请输入有效用户名和密码'});
   const ip=tokenHash(req.ip||'');
   if(!store.loginAttempt(`ip:${ip}`,5)||!store.loginAttempt('account',30))return res.status(429).json({ok:false,message:'登录尝试过多，请 15 分钟后重试'});
   const account=store.adminAccount();const valid=await verifyPassword(password,account?.passwordHash);
   if(!valid||!account||username!==account.username){store.log(username.slice(0,40),'login.failed','session',null,null);return res.status(401).json({ok:false,message:'用户名或密码不正确'});}
   const old=cookieToken(req);if(old)store.revoke(tokenHash(old));
   const session=makeSession(store);store.log(account.username,'login.success','session',null,null);
   res.cookie(sessionCookie,session.token,cookie).json({ok:true,csrf:session.csrf});
  }catch(error){next(error);}
 });
 const router=Router();
 router.use((req,res,next)=>{const session=user(req);if(!session)return res.status(401).json({ok:false,message:'请先登录，或会话已过期'});req.adminSession=session;req.actor=store.adminAccount().username;next();});
 router.use((req,res,next)=>{
  if(['GET','HEAD'].includes(req.method))return next();
  if(!sameOrigin(req)||req.get('X-CSRF-Token')!==req.adminSession.csrf)return res.status(403).json({ok:false,message:'安全校验失败，请刷新页面后重试'});
  next();
 });
 const route=fn=>(req,res,next)=>{try{fn(req,res);}catch(error){if(error.status)res.status(error.status).json({ok:false,message:error.message});else next(error);}};
 router.get('/session',route((req,res)=>res.json({ok:true,username:req.actor,csrf:req.adminSession.csrf})));
 router.post('/logout',route((req,res)=>{store.revoke(req.adminSession.tokenHash);store.log(req.actor,'logout','session',null,null);res.clearCookie(sessionCookie,{...cookie,maxAge:undefined}).json({ok:true});}));
 router.get('/settings',route((_req,res)=>res.json({ok:true,...store.settings()})));
 router.patch('/settings',route((req,res)=>{
  if(typeof req.body?.autoApproveMessages!=='boolean'||typeof req.body?.expected!=='boolean')return res.status(400).json({ok:false,message:'开关和原设置必须是布尔值'});
  res.json({ok:true,...store.changeSetting(req.body.autoApproveMessages,req.actor,req.body.expected)});
 }));
 router.get('/stats',route((_req,res)=>res.json({ok:true,...store.stats()})));
 router.get('/messages',route((req,res)=>{
  const {q='',status='',source='',order='desc',page='1',limit='20'}=req.query;
  if(typeof q!=='string'||q.length>120||!['',...statuses].includes(status)||!['','seed','user'].includes(source)||!['asc','desc'].includes(order)||!/^\d+$/.test(page)||!/^\d+$/.test(limit)||Number(page)<1||Number(page)>1000000||Number(limit)<1||Number(limit)>100)return res.status(400).json({ok:false,message:'搜索或分页条件不合法'});
  res.json({ok:true,...store.adminMessages({q,status,source,order,page:Number(page),limit:Number(limit)})});
 }));
 router.patch('/messages/:id/status',route((req,res)=>{
  if(!statuses.includes(req.body?.status)||!statuses.includes(req.body?.expected))return res.status(400).json({ok:false,message:'留言状态不合法'});
  const row=store.moderate(req.params.id,req.body.status,req.body.expected,req.actor);
  if(row.status==='approved'){const {id,name,major,year,content}=row;publishApproved({id,name,major,year,content});}else publishRemoved(row.id);
  res.json({ok:true,message:row});
 }));
 router.get('/audit',route((req,res)=>{
  const page=Number(req.query.page||1);if(!Number.isInteger(page)||page<1||page>1000000)return res.status(400).json({ok:false,message:'页码不合法'});
  res.json({ok:true,items:store.auditList(page)});
 }));
 app.use('/api/admin',router);
}
