import {createHash, createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {Buffer} from 'node:buffer';

export const SESSION_SECONDS = 8 * 60 * 60;
export const digest = value => createHash('sha256').update(value).digest('hex');
export const randomToken = () => randomBytes(32).toString('hex');
export const passwordReady = env => typeof env.JUDGE_PASSWORD === 'string' && env.JUDGE_PASSWORD.length >= 16;
export const passwordVersion = env => digest('tryon-judge-password-v1\0' + env.JUDGE_PASSWORD);
export function equalSecret(a,b){return typeof a==='string' && typeof b==='string' && timingSafeEqual(Buffer.from(digest(a),'hex'),Buffer.from(digest(b),'hex'))}
export function sessionCookieName(request){return new URL(request.url).protocol==='https:'?'__Host-tryon-judge':'tryon-judge-local'}
export function readSessionCookie(request){
  const name=sessionCookieName(request);
  const value=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);
  return /^[a-f0-9]{64}$/.test(value||'')?value:null;
}
export function cookieHeader(request,value,maxAge=SESSION_SECONDS){
  const secure=new URL(request.url).protocol==='https:'?'; Secure':'';
  return `${sessionCookieName(request)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
export function csrfToken(env,cookie){return createHmac('sha256',env.JUDGE_PASSWORD).update('tryon-csrf-v1\0'+cookie).digest('hex')}
export function loginScope(env,request){return createHmac('sha256',env.JUDGE_PASSWORD).update('tryon-login-ip-v1\0'+(request.headers.get('cf-connecting-ip')||'unknown')).digest('hex')}
export function sameOrigin(request,required=true){
  const url=new URL(request.url),origin=request.headers.get('origin');
  if(url.protocol!=='https:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))return false;
  if(!origin)return !required;
  return origin===url.origin;
}
export function serverUnitLimit(env){
  if(env.SERVER_UNIT_LIMIT===undefined||env.SERVER_UNIT_LIMIT==='')return 32;
  const raw=String(env.SERVER_UNIT_LIMIT);
  if(!/^\d+$/.test(raw))return 0;
  const n=Number(raw);
  return Number.isSafeInteger(n)&&n>=2&&n<=1000000&&n%2===0?n:0;
}
export function responseJSON(body,status=200,extra={}){
  return Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...extra}});
}
export async function boundedText(request,maxBytes){
  const size=Number(request.headers.get('content-length'));
  if(Number.isFinite(size)&&size>maxBytes)throw Object.assign(new Error('Request too large'),{status:413});
  if(!request.body)return '';
  const reader=request.body.getReader(),decoder=new TextDecoder();let bytes=0,text='';
  try{for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>maxBytes){await reader.cancel();throw Object.assign(new Error('Request too large'),{status:413})}text+=decoder.decode(next.value,{stream:true})}return text+decoder.decode()}
  finally{reader.releaseLock()}
}
