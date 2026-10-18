import {randomUUID} from 'node:crypto';
import {createYouCamClient,validateTryOn,safeStorageUrl,AppError,MAX_IMAGE_BYTES} from './youcam.mjs';
import * as store from './judge-store.mjs';
import {SESSION_SECONDS,digest,randomToken,passwordReady,passwordVersion,equalSecret,readSessionCookie,cookieHeader,csrfToken,sameOrigin,serverUnitLimit,responseJSON,boundedText,loginScope} from './judge-security.mjs';

const MAX_BODY=24*1024*1024;
const denied=(status,code,message)=>responseJSON({error:code,message},status);
const nowSeconds=()=>Math.floor(Date.now()/1000);
function redirect(path,headers={}){return new Response(null,{status:303,headers:{Location:path,'Cache-Control':'no-store',...headers}})}
function credentialEnabled(env){return passwordReady(env)&&typeof env.YOUCAM_API_KEY==='string'&&Boolean(env.YOUCAM_API_KEY.trim())&&env.YOUCAM_ENABLE_UPLOAD==='true'}
async function session(request,env,now){
  if(!env.DB||!passwordReady(env))return null;
  const cookie=readSessionCookie(request);if(!cookie)return null;
  const ownerHash=digest(cookie),row=await store.findSession(env.DB,ownerHash,passwordVersion(env),now);
  return row?{cookie,ownerHash,token:csrfToken(env,cookie)}:null;
}
function csrfOK(request,owner){return equalSecret(request.headers.get('x-app-token'),owner.token)}
function taskBody(row,id){
  if(row.status==='success'&&row.result_url)return {status:'success',imageUrl:`/api/results/${encodeURIComponent(id)}`};
  if(row.status==='error')return {status:'error',message:'These photos did not produce a verified try-on. Contact the project owner before trying again.'};
  return {status:'running'};
}
async function login(request,env,now){
  if(!sameOrigin(request))return denied(403,'origin','Open judge access from this site.');
  if(!env.DB||!passwordReady(env))return denied(503,'unavailable','Judge access is not open yet. You can still view the recorded example.');
  const scope=loginScope(env,request);
  if(!await store.claimLoginAttempt(env.DB,scope,now))return denied(429,'wait','Too many access-code attempts. Please wait fifteen minutes.');
  const type=request.headers.get('content-type')?.split(';')[0];
  if(!['application/json','application/x-www-form-urlencoded'].includes(type))return denied(415,'content_type','Use the judge access form.');
  const text=await boundedText(request,4096);
  let password;
  try{password=type==='application/json'?JSON.parse(text).password:new URLSearchParams(text).get('password')}catch{return denied(400,'invalid_input','Enter the access code again.')}
  if(!equalSecret(password,env.JUDGE_PASSWORD))return type==='application/json'?denied(401,'access','The access code was not accepted.'):redirect('/judge?error=1');
  const cookie=randomToken();
  await store.createSession(env.DB,{idHash:digest(cookie),passwordVersion:passwordVersion(env),createdAt:now,expiresAt:now+SESSION_SECONDS});
  await store.clearLoginAttempts(env.DB,scope);
  const headers={'Set-Cookie':cookieHeader(request,cookie)};
  return type==='application/json'?responseJSON({authenticated:true},200,headers):redirect('/',headers);
}

// Dependencies are injected only by local tests. Production uses Workers env
// and the preserved provider adapter; no request parameter can select a key,
// transport, spending limit, password, provider host or owner.
export async function handleJudgeAPI(request,env,{fetchImpl=fetch,now=nowSeconds()}={}){
  const url=new URL(request.url),method=request.method;
  try{
    if(env.DB)await store.cleanupExpired(env.DB,now);
    if(url.pathname==='/api/judge/login'&&method==='POST')return await login(request,env,now);
    const owner=await session(request,env,now);
    if(url.pathname==='/api/config'&&method==='GET'){
      const available=Boolean(owner&&credentialEnabled(env)&&await store.usedUnits(env.DB)+store.UNIT_COST<=serverUnitLimit(env));
      return responseJSON({live:available,keyConfigured:available,uploadEnabled:available,judgeAuthenticated:Boolean(owner),token:owner?.token||'',maxImageMiB:8,
        message:available?'Live try-on is available for this judging session. Each request sends the chosen photos to YouCam.':owner?'Live try-on is unavailable. You can compare locally or view the recorded example.':'Compare locally or view the recorded example. Sign in for a live try-on.'});
    }
    if(!owner)return denied(401,'judge_access','Sign in with the judge access code before using live try-on.');
    if(url.pathname==='/api/judge/logout'&&method==='POST'){
      if(!sameOrigin(request)||!csrfOK(request,owner))return denied(403,'session','Refresh this page before signing out.');
      await store.removeSession(env.DB,owner.ownerHash);
      return responseJSON({authenticated:false},200,{'Set-Cookie':cookieHeader(request,'',0)});
    }
    const resultMatch=url.pathname.match(/^\/api\/results\/([a-f0-9-]{36})$/i);
    if(resultMatch&&method==='GET'){
      const row=await store.ownAttempt(env.DB,resultMatch[1],owner.ownerHash,now);
      if(!row||row.status!=='success'||!row.result_url)return denied(404,'not_found','This result is not available in this session.');
      let upstream;
      try{upstream=await fetchImpl(safeStorageUrl(row.result_url),{redirect:'manual',signal:AbortSignal.timeout(20000)})}catch{return denied(502,'result_unavailable','The result image could not be opened. You can check this result again without starting another try-on.')}
      const mime=upstream.headers.get('content-type')?.split(';')[0];
      if(!upstream.ok||!['image/jpeg','image/png'].includes(mime)||Number(upstream.headers.get('content-length'))>MAX_IMAGE_BYTES)return denied(502,'result_unavailable','The result image could not be opened.');
      const reader=upstream.body?.getReader();if(!reader)return denied(502,'result_unavailable','The result image is unavailable.');
      let bytes=0;const stream=new ReadableStream({async pull(controller){const next=await reader.read();if(next.done){controller.close();return}bytes+=next.value.byteLength;if(bytes>MAX_IMAGE_BYTES){await reader.cancel();controller.error(new Error('Result too large'));return}controller.enqueue(next.value)},cancel(){return reader.cancel()}});
      return new Response(stream,{headers:{'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Referrer-Policy':'no-referrer'}});
    }
    if(!csrfOK(request,owner)||!sameOrigin(request,method!=='GET'))return denied(403,'session','Refresh this page before making a request.');
    if(url.pathname==='/api/tryon'&&method==='POST'){
      if(!credentialEnabled(env))return denied(503,'api_disabled','Live try-on is not available. No photos were sent.');
      if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return denied(415,'content_type','Use a JSON request.');
      let raw;try{raw=JSON.parse(await boundedText(request,MAX_BODY))}catch(error){if(error.status===413)throw error;return denied(400,'invalid_json','The request could not be read.')}
      const input=validateTryOn(raw),localId=randomUUID();
      const reserved=await store.reserveAttempt(env.DB,{localId,ownerHash:owner.ownerHash,now,limit:serverUnitLimit(env)});
      if(!reserved)return denied(429,'capacity','The judging allowance is used up. No new photos were sent.');
      try{
        const providerId=await createYouCamClient({apiKey:env.YOUCAM_API_KEY,fetchImpl}).start(input);
        await store.submitted(env.DB,localId,providerId);
        return responseJSON({taskId:localId,status:'running'},202);
      }catch{
        await store.failed(env.DB,localId).catch(()=>{});
        return denied(502,'tryon_unavailable','The try-on request did not finish. It will not be retried automatically. Contact the project owner before trying again.');
      }
    }
    const taskMatch=url.pathname.match(/^\/api\/tasks\/([a-f0-9-]{36})$/i);
    if(taskMatch&&method==='GET'){
      const id=taskMatch[1],row=await store.ownAttempt(env.DB,id,owner.ownerHash,now);
      if(!row)return denied(404,'not_found','This task is not available in this session.');
      if(row.status!=='running')return responseJSON(taskBody(row,id));
      const claim=await store.claimPoll(env.DB,id,owner.ownerHash,now);
      if(!claim)return responseJSON(taskBody(row,id));
      try{
        const result=await createYouCamClient({apiKey:env.YOUCAM_API_KEY,fetchImpl}).status(claim.provider_task_id);
        await store.pollResult(env.DB,id,result);
        return responseJSON(taskBody({...row,status:result.status,result_url:result.imageUrl},id));
      }catch{
        await store.releasePoll(env.DB,id).catch(()=>{});
        return denied(502,'task_unavailable','The existing task could not be checked. Check this task again without starting another try-on.');
      }
    }
    return denied(404,'not_found','This page was not found.');
  }catch(error){
    if(error instanceof AppError)return denied(error.status,error.code,error.message);
    if(error?.status===413)return denied(413,'body_limit','The request is too large.');
    return denied(503,'unavailable','This service is temporarily unavailable. No automatic retry will run.');
  }
}
