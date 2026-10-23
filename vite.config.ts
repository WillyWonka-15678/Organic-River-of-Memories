import {defineConfig} from 'vite';
import {runtimeConfig} from './server/config.mjs';
const target=process.env.MEMORY_API_TARGET||'http://127.0.0.1:3000';
const proxy={'/api':{target},'/socket.io':{target,ws:true}};
const install=server=>{server.middlewares.use('/display-config.js',(_req,res)=>{try{const {submitUrl,serverUrl,showQr,exhibitionMode}=runtimeConfig({...process.env,PORT:new URL(target).port||'3000'});res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-store');res.end(`window.__EXHIBITION_CONFIG__=${JSON.stringify({submitUrl,serverUrl,showQr,exhibitionMode})};`);}catch(error){res.statusCode=500;res.end('/* invalid exhibition config */');}});};
export default defineConfig({server:{proxy},preview:{proxy},plugins:[{name:'display-runtime',configureServer:install,configurePreviewServer:install}]});

