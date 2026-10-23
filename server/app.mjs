import express from 'express';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';
import { validateMessage } from './messages.mjs';
import {installAdmin} from './admin.mjs';
import {cookieToken,tokenHash} from './auth.mjs';
import {runtimeConfig,root} from './config.mjs';
import {qrSvg} from './entry.mjs';
import {join} from 'node:path';

export function createApp({ store,publishApproved=()=>{},publishRemoved=()=>{},snapshot=()=>({ok:true,items:store.approved()}),devQuery = process.env.NODE_ENV === 'development' && process.env.ENABLE_DEV_MESSAGES === '1' } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if(process.env.TRUST_PROXY==='loopback')app.set('trust proxy','loopback');
  app.use(express.json({ limit: '8kb' }));
  if(store)installAdmin(app,store,{publishApproved,publishRemoved});
  app.get('/display-config.js',(req,res,next)=>{try{const {submitUrl,serverUrl,showQr,exhibitionMode}=runtimeConfig({...process.env,PORT:String(req.socket.localPort)});res.set('Cache-Control','no-store').type('text/javascript').send(`window.__EXHIBITION_CONFIG__=${JSON.stringify({submitUrl,serverUrl,showQr,exhibitionMode})};`);}catch(e){next(e);}});
  app.get('/api/public-config',(req,res,next)=>{try{const {submitUrl,serverUrl,showQr,exhibitionMode}=runtimeConfig({...process.env,PORT:String(req.socket.localPort)});res.set('Cache-Control','no-store').json({submitUrl,serverUrl,showQr,exhibitionMode});}catch(error){next(error);}});
  app.get('/api/entry-qr.svg',async(req,res,next)=>{try{const c=runtimeConfig({...process.env,PORT:String(req.socket.localPort)});if(!c.submitUrl)return res.status(503).end();res.set('Cache-Control','no-store').type('image/svg+xml').send(await qrSvg(c.submitUrl));}catch(e){next(e);}});
  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'memory-river', status: 'running' }));
  app.post('/api/test', (_req, res) => {
    console.log(`[${new Date().toISOString()}] 收到连接测试请求`);
    res.json({ ok: true, message: '电脑已收到手机发送的测试请求' });
  });
  app.get('/test', (_req, res) => res.sendFile(fileURLToPath(new URL('./public/test.html', import.meta.url))));
  app.get('/submit', (_req,res) => {const c=runtimeConfig();if(c.displayOnly)return res.redirect(c.submitUrl);res.sendFile(fileURLToPath(new URL('./public/submit.html',import.meta.url)));});
  // No proxy trust: a phone cannot forge its address with X-Forwarded-For.
  const attempts = new Map();
  app.post('/api/messages', (req,res,next) => {
    if(!store)return res.status(503).json({ok:false,message:'此服务只提供大屏，请使用二维码中的手机入口提交'});
    const now=Date.now(),ip=req.ip;
    for (const [key,value] of attempts) if(now-value.start>=60000)attempts.delete(key);
    const bucket=attempts.get(ip)||{start:now,count:0};
    if(bucket.count>=10){res.set('Retry-After',String(Math.ceil((60000-(now-bucket.start))/1000)));return res.status(429).json({ok:false,message:'提交过于频繁，请稍后再试'});}
    bucket.count++;attempts.set(ip,bucket);
    let value;
    try {value=validateMessage(req.body);} catch(error){return res.status(400).json({ok:false,message:error.message});}
    try {
      if(!store)throw new Error('Message store unavailable');
      const record=store.submit(value);
      if(record.status==='approved'){
        const {id,name,major,year,content}=record;
        publishApproved({id,name,major,year,content});
      }
      res.status(201).json({ok:true,id:record.id,status:record.status,message:record.status==='approved'?'你的记忆已送达，请抬头看看大屏':'留言已提交，等待审核'});
    } catch(error){next(error);}
  });
  app.get('/api/display/messages',(_req,res,next)=>{
    const allowed=(process.env.DISPLAY_ORIGINS||'').split(',').map(s=>s.trim());
    if(allowed.includes(_req.get('origin'))){res.set('Access-Control-Allow-Origin',_req.get('origin'));res.vary('Origin');}
    res.set('Cache-Control','no-store');
    try{res.json(snapshot());}catch(error){next(error);}
  });
  app.get('/api/messages',(req,res,next)=>{
    const ip=req.socket.remoteAddress;
    const loopback=ip==='::1'||(isIP(ip||'')===4&&ip.startsWith('127.'))||ip==='::ffff:127.0.0.1';
    res.set('Cache-Control','no-store');
    const token=cookieToken(req);
    if(!devQuery||!loopback||!token||!store?.session(tokenHash(token)))return res.status(403).json({ok:false,message:'旧版完整查询需要本机开发模式及管理员登录，请使用 /api/admin/messages'});
    const number=(value,fallback,max)=>value===undefined?fallback:typeof value==='string'&&/^\d+$/.test(value)&&Number(value)>=1&&Number(value)<=max?Number(value):null;
    const page=number(req.query.page,1,1000000),limit=number(req.query.limit,20,100);
    if(page===null||limit===null)return res.status(400).json({ok:false,message:'page 应为正整数，limit 应为 1–100'});
    try {res.json({ok:true,...store.list(page,limit)});}catch(error){next(error);}
  });
  // Only known display assets are public; never serve the workspace, data or backups.
  for(const path of ['assets','models','mediapipe','workers'])app.use(`/${path}`,express.static(join(root,'dist',path),{dotfiles:'deny'}));
  app.get('/favicon.svg',(_req,res)=>res.sendFile(join(root,'dist/favicon.svg')));
  app.get('/display',(_req,res)=>res.sendFile(join(root,'dist/index.html')));
  app.use((_req, res) => res.status(404).json({ ok: false, message: '请求地址不存在' }));
  app.use((error, _req, res, _next) => {
    const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500;
    if (status === 500) console.error(error);
    res.status(status).json({ ok: false, message: status === 413 ? '请求内容过大' : status === 400 ? '请求 JSON 格式不正确' : '服务器暂时无法处理请求' });
  });
  return app;
}
