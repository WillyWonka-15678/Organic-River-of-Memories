import {scrypt,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt),options={N:131072,r:8,p:1,maxmem:256*1024*1024};
export const tokenHash=value=>createHash('sha256').update(value).digest('hex');
export async function hashPassword(password){
  if(typeof password!=='string'||password.length===0||Buffer.byteLength(password)>256)throw new Error('密码不能为空，最多 256 UTF-8 字节。');
  const salt=randomBytes(16).toString('hex');return `scrypt$${salt}$${(await derive(password,salt,64,options)).toString('hex')}`;
}
export async function verifyPassword(password,stored){
  const [,salt,hash]=(stored||`scrypt$00000000000000000000000000000000$${'0'.repeat(128)}`).split('$');
  const actual=await derive(password,salt,64,options),expected=Buffer.from(hash,'hex');
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export const sessionCookie='memory_admin';
export function cookieToken(req){const match=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(`${sessionCookie}=`));const value=match?.slice(sessionCookie.length+1);return /^[a-f0-9]{64}$/.test(value||'')?value:'';}
export function makeSession(store){const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');store.createSession(tokenHash(token),csrf,Date.now()+8*3600000);return {token,csrf};}
export function sameOrigin(req){
  const expected=process.env.ADMIN_ORIGIN||`${req.protocol}://${req.get('host')}`;
  return req.get('origin')===expected&&req.get('sec-fetch-site')!=='cross-site';
}

