import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {sqliteD1,migrate} from './sqlite-d1.mjs';
import {handleJudgeAPI} from '../lib/judge-handler.mjs';
import {reserveAttempt,usedUnits,cleanupExpired} from '../lib/judge-store.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ORIGIN='https://judge.example';
const fixturePassword='local-test-passphrase-not-real';
const fixtureKey='fixture-key-not-a-real-provider-key';
function environment(){return {DB:migrate(sqliteD1()),JUDGE_PASSWORD:fixturePassword,YOUCAM_API_KEY:fixtureKey,YOUCAM_ENABLE_UPLOAD:'true',SERVER_UNIT_LIMIT:'32'}}
function req(url,method='GET',body,headers={}){return new Request(ORIGIN+url,{method,headers:{...(method==='GET'?{}:{Origin:ORIGIN,'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})})}
async function signIn(env,ip='192.0.2.1'){
 const r=await handleJudgeAPI(req('/api/judge/login','POST',{password:fixturePassword},{'CF-Connecting-IP':ip}),env,{now:1000,fetchImpl:()=>{throw Error('No network in auth test')}});
 assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];
 const config=await(await handleJudgeAPI(req('/api/config','GET',undefined,{Cookie:cookie}),env,{now:1000})).json();
 return {cookie,token:config.token,headers:{Cookie:cookie,'X-App-Token':config.token}};
}
function headerImage(){const b=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.write('IHDR',12);b.writeUInt32BE(768,16);b.writeUInt32BE(1024,20);return {mime:'image/png',base64:b.toString('base64')}}
const input=()=>({consent:true,source:headerImage(),garment:headerImage(),category:'upper_body'});
function providerFixture(db,{failStart=false,failPollOnce=false}={}){
 const calls=[];let file=0,created=0,poll=0;
 const fetchImpl=async(url,options={})=>{
  const u=new URL(url);calls.push({method:options.method||'GET',host:u.hostname,path:u.pathname});
  assert.equal(await usedUnits(db)>=2,true,'Provider was called before a durable reservation');
  if(failStart)throw Error('Private '+fixtureKey+' https://private.invalid/signed?secret=fixture');
  if(u.pathname==='/s2s/v2.0/file'){
   const f=JSON.parse(options.body).files[0];file++;
   return Response.json({data:{files:[{file_id:'fixture-file-'+file,requests:[{method:'PUT',url:'https://yce-us.s3.amazonaws.com/local-input-'+file,headers:{'Content-Type':f.content_type,'Content-Length':String(f.file_size)}}]}]}});
  }
  if(options.method==='PUT')return new Response('',{status:200});
  if(u.pathname==='/s2s/v2.0/task/cloth-v4'){created++;return Response.json({data:{task_id:'fixture-provider-'+created}})}
  if(u.pathname.startsWith('/s2s/v2.0/task/cloth-v4/')){poll++;if(failPollOnce&&poll===1)throw Error('offline temporary lookup failure');return Response.json({data:{task_status:'success',results:{url:'https://yce-us.s3.amazonaws.com/fixture-result.jpg?signature=private-fixture'}}})}
  if(u.pathname==='/fixture-result.jpg')return new Response(Buffer.from([255,216,255,217]),{headers:{'Content-Type':'image/jpeg','Content-Length':'4'}});
  throw Error('Unexpected fixture transport path');
 };
 return {fetchImpl,calls,get creates(){return created},get polls(){return poll}};
}

test('anonymous config exposes no key, spending values or authenticated API access',async()=>{
 const env=environment();try{
  const r=await handleJudgeAPI(req('/api/config'),env,{now:1000});const c=await r.json();assert.equal(c.live,false);assert.equal(c.token,'');assert.equal(c.judgeAuthenticated,false);assert.equal(JSON.stringify(c).includes(fixtureKey),false);assert.equal(/remaining|spent|unitLimit|32/.test(JSON.stringify(c)),false);
  const denied=await handleJudgeAPI(req('/api/tryon','POST',input()),env,{now:1000,fetchImpl:()=>assert.fail('Provider reached')});assert.equal(denied.status,401);assert.equal(await usedUnits(env.DB),0);
 }finally{env.DB.close()}
});
test('judge login is same-origin, rate-limited and sets an HttpOnly Secure SameSite cookie',async()=>{
 const env=environment();try{
  const cross=await handleJudgeAPI(req('/api/judge/login','POST',{password:fixturePassword},{Origin:'https://other.example'}),env,{now:1000});assert.equal(cross.status,403);
  const good=await handleJudgeAPI(req('/api/judge/login','POST',{password:fixturePassword}),env,{now:1000});assert.equal(good.status,200);assert.match(good.headers.get('set-cookie'),/HttpOnly/);assert.match(good.headers.get('set-cookie'),/Secure/);assert.match(good.headers.get('set-cookie'),/SameSite=Strict/);assert.doesNotMatch(good.headers.get('set-cookie'),/Domain=/);
  for(let i=0;i<8;i++)assert.equal((await handleJudgeAPI(req('/api/judge/login','POST',{password:'wrong'},{'CF-Connecting-IP':'192.0.2.99'}),env,{now:1000})).status,401);
  assert.equal((await handleJudgeAPI(req('/api/judge/login','POST',{password:fixturePassword},{'CF-Connecting-IP':'192.0.2.99'}),env,{now:1000})).status,429);
  assert.equal((await handleJudgeAPI(req('/api/judge/login','POST',{password:fixturePassword},{'CF-Connecting-IP':'192.0.2.99'}),env,{now:1901})).status,200);
 }finally{env.DB.close()}
});
test('CSRF, missing consent, unsupported images and oversized bodies reserve nothing',async()=>{
 const env=environment();try{const auth=await signIn(env),never=()=>assert.fail('Provider reached');
  assert.equal((await handleJudgeAPI(req('/api/tryon','POST',input(),{...auth.headers,Origin:'https://other.example'}),env,{now:1000,fetchImpl:never})).status,403);
  assert.equal((await handleJudgeAPI(req('/api/tryon','POST',input(),{Cookie:auth.cookie,'X-App-Token':'wrong'}),env,{now:1000,fetchImpl:never})).status,403);
  assert.equal((await handleJudgeAPI(req('/api/tryon','POST',{...input(),consent:false},auth.headers),env,{now:1000,fetchImpl:never})).status,400);
  assert.equal((await handleJudgeAPI(req('/api/tryon','POST',{...input(),source:{mime:'image/gif',base64:'abcd'}},auth.headers),env,{now:1000,fetchImpl:never})).status,400);
  assert.equal((await handleJudgeAPI(req('/api/tryon','POST','{}',{...auth.headers,'Content-Length':String(25*1024*1024)}),env,{now:1000,fetchImpl:never})).status,413);
  assert.equal(await usedUnits(env.DB),0);
 }finally{env.DB.close()}
});
test('real provider adapter protocol runs only after reservation; tasks/results belong to the session owner',async()=>{
 const env=environment();try{const a=await signIn(env),b=await signIn(env,'192.0.2.2'),fixture=providerFixture(env.DB);
  const start=await handleJudgeAPI(req('/api/tryon','POST',input(),a.headers),env,{now:1000,fetchImpl:fixture.fetchImpl});assert.equal(start.status,202);const task=await start.json();assert.match(task.taskId,/^[a-f0-9-]{36}$/i);assert.equal(fixture.creates,1);assert.equal(await usedUnits(env.DB),2);
  const other=await handleJudgeAPI(req('/api/tasks/'+task.taskId,'GET',undefined,b.headers),env,{now:1011,fetchImpl:fixture.fetchImpl});assert.equal(other.status,404);assert.equal(fixture.polls,0);
  const poll=await handleJudgeAPI(req('/api/tasks/'+task.taskId,'GET',undefined,a.headers),env,{now:1011,fetchImpl:fixture.fetchImpl});const body=await poll.json();assert.equal(body.status,'success');assert.equal(body.imageUrl,'/api/results/'+task.taskId);assert.doesNotMatch(JSON.stringify(body),/signature|fixture-provider|s3.amazonaws/);
  assert.equal((await handleJudgeAPI(req(body.imageUrl,'GET',undefined,{Cookie:b.cookie}),env,{now:1012,fetchImpl:fixture.fetchImpl})).status,404);
  const image=await handleJudgeAPI(req(body.imageUrl,'GET',undefined,{Cookie:a.cookie}),env,{now:1012,fetchImpl:fixture.fetchImpl});assert.equal(image.status,200);assert.equal((await image.arrayBuffer()).byteLength,4);assert.equal(image.headers.get('cache-control'),'no-store');
  assert.equal(fixture.calls.filter(c=>c.path==='/s2s/v2.0/file').length,2);assert.equal(fixture.calls.filter(c=>c.method==='PUT').length,2);
 }finally{env.DB.close()}
});
test('provider failure stays charged, is sanitized and is never automatically retried',async()=>{
 const env=environment();try{const a=await signIn(env),fixture=providerFixture(env.DB,{failStart:true});
  const r=await handleJudgeAPI(req('/api/tryon','POST',input(),a.headers),env,{now:1000,fetchImpl:fixture.fetchImpl});assert.equal(r.status,502);const text=await r.text();assert.doesNotMatch(text,/fixture-key|private.invalid|signature/);assert.equal(fixture.calls.length,1);assert.equal(await usedUnits(env.DB),2);assert.equal(env.DB.sqlite.prepare('SELECT status FROM tryon_attempts').get().status,'error');
 }finally{env.DB.close()}
});
test('lookup retry retains the same provider task and reserves no additional units',async()=>{
 const env=environment();try{const a=await signIn(env),fixture=providerFixture(env.DB,{failPollOnce:true});const t=await(await handleJudgeAPI(req('/api/tryon','POST',input(),a.headers),env,{now:1000,fetchImpl:fixture.fetchImpl})).json();
  assert.equal((await handleJudgeAPI(req('/api/tasks/'+t.taskId,'GET',undefined,a.headers),env,{now:1011,fetchImpl:fixture.fetchImpl})).status,502);
  const r=await handleJudgeAPI(req('/api/tasks/'+t.taskId,'GET',undefined,a.headers),env,{now:1022,fetchImpl:fixture.fetchImpl});assert.equal((await r.json()).status,'success');assert.equal(fixture.creates,1);assert.equal(fixture.polls,2);assert.equal(await usedUnits(env.DB),2);
 }finally{env.DB.close()}
});
test('expired task references are cleared on the next request while the spending ledger remains charged',async()=>{
 const env=environment();try{const a=await signIn(env),fixture=providerFixture(env.DB);const t=await(await handleJudgeAPI(req('/api/tryon','POST',input(),a.headers),env,{now:1000,fetchImpl:fixture.fetchImpl})).json();await handleJudgeAPI(req('/api/tasks/'+t.taskId,'GET',undefined,a.headers),env,{now:1011,fetchImpl:fixture.fetchImpl});
  await handleJudgeAPI(req('/api/config','GET',undefined,a.headers),env,{now:2801});const row=env.DB.sqlite.prepare('SELECT * FROM tryon_attempts').get();assert.equal(row.provider_task_id,null);assert.equal(row.result_url,null);assert.equal(row.status,'expired');assert.equal(await usedUnits(env.DB),2);
  assert.equal((await handleJudgeAPI(req('/api/tasks/'+t.taskId,'GET',undefined,a.headers),env,{now:2801,fetchImpl:()=>assert.fail('Expired task contacted provider')})).status,404);
 }finally{env.DB.close()}
});
test('full durable cap blocks provider calls and ignores a client-supplied larger limit',async()=>{
 const env=environment();try{const a=await signIn(env);for(let i=0;i<16;i++)assert.ok(await reserveAttempt(env.DB,{localId:randomUUID(),ownerHash:'fixture',now:1000,limit:32}));
  const r=await handleJudgeAPI(req('/api/tryon','POST',{...input(),SERVER_UNIT_LIMIT:1000000},a.headers),env,{now:1000,fetchImpl:()=>assert.fail('Budget exhausted but provider reached')});assert.equal(r.status,429);assert.equal(await usedUnits(env.DB),32);await cleanupExpired(env.DB,10000);assert.equal(await usedUnits(env.DB),32);
 }finally{env.DB.close()}
});
test('logout and password rotation invalidate sessions; secret vars never enter config',async()=>{
 const env=environment();try{const a=await signIn(env);const c=await(await handleJudgeAPI(req('/api/config','GET',undefined,a.headers),env,{now:1001})).json();assert.equal(c.live,true);assert.doesNotMatch(JSON.stringify(c),new RegExp(fixturePassword+'|'+fixtureKey));
  env.JUDGE_PASSWORD='rotated-local-test-passphrase';assert.equal((await(await handleJudgeAPI(req('/api/config','GET',undefined,a.headers),env,{now:1002})).json()).judgeAuthenticated,false);env.JUDGE_PASSWORD=fixturePassword;
  const r=await handleJudgeAPI(req('/api/judge/logout','POST',{},a.headers),env,{now:1002});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);assert.equal((await(await handleJudgeAPI(req('/api/config','GET',undefined,a.headers),env,{now:1003})).json()).judgeAuthenticated,false);
 }finally{env.DB.close()}
});
test('12 concurrent SQLite connections cannot reserve above32 units /16 attempts',async()=>{
 const base=path.join(root,'.qa');await mkdir(base,{recursive:true});const dir=await mkdtemp(path.join(base,'concurrency-')),file=path.join(dir,'ledger.sqlite');const db=migrate(sqliteD1(file));db.sqlite.exec('PRAGMA journal_mode=WAL');
 try{const outputs=await Promise.all(Array.from({length:12},()=>new Promise((resolve,reject)=>{const w=new Worker(new URL('./reservation-worker.mjs',import.meta.url),{workerData:{file}});w.once('message',resolve);w.once('error',reject);w.once('exit',code=>{if(code)reject(Error('Worker exited '+code))})})));const accepted=outputs.reduce((n,x)=>n+x.accepted,0);assert.equal(accepted,16);assert.equal(await usedUnits(db),32);assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM tryon_attempts').get().n,16);await writeFile(path.join(dir,'proof.json'),JSON.stringify({connections:12,requested:48,accepted,units:32,providerCalls:0},null,2));}
 finally{db.close()}
});
