import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import { createApp } from './app.mjs';
export function createMessageServer(store,{devQuery}={}){
  let revision=0;const epoch=randomUUID();let io;
  const publishApproved=record=>io.emit('message:approved',{epoch,revision:++revision,record});
  const snapshot=()=>({ok:true,epoch,revision,items:store.approved()});
  const publishRemoved=id=>io.emit('message:removed',{epoch,revision:++revision,id});
  const server=createServer(createApp({store,devQuery,publishApproved,publishRemoved,snapshot}));
  io=new Server(server,{cors:{origin:(process.env.DISPLAY_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean),methods:['GET','POST'],credentials:false}});
  return {server,io,publishRemoved}; // Stage 4: persist status first, then publish removal.
}
