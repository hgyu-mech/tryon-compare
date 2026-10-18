// Native workerd fetch + actual adapter; all outbound HTTP is a local fixture.
// No credentials, real provider network, uploaded photos or API units.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
const adapter=await readFile(new URL('../lib/youcam.mjs',import.meta.url),'utf8');
const calls=[];
let file=0;
let scenario='normal';
const worker=`import {createYouCamClient} from './youcam.mjs';
export default {async fetch(){
try { const image={mime:'image/png',bytes:new Uint8Array(33)};
const id=await createYouCamClient({apiKey:'fixture-not-real'}).start({source:image,garment:image,category:'upper_body'});
return Response.json({ok:true,id});
}catch(error){return Response.json({ok:false,code:error.code||error.name,message:error.message})}
}};`;
const mf=new Miniflare({
  modules:[{type:'ESModule',path:'entry.mjs',contents:worker},{type:'ESModule',path:'youcam.mjs',contents:adapter}],
  compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],cf:false,
  outboundService:async request=>{
    const u=new URL(request.url);calls.push({host:u.hostname,path:u.pathname,method:request.method});
    assert.ok(['yce-api-01.makeupar.com','yce-us.s3.amazonaws.com'].includes(u.hostname));
    if((scenario==='api-redirect'&&u.hostname==='yce-api-01.makeupar.com')||(scenario==='upload-redirect'&&u.hostname==='yce-us.s3.amazonaws.com'))return new Response(null,{status:302,headers:{Location:'https://untrusted.invalid/do-not-follow'}});
    if(u.pathname==='/s2s/v2.0/file'){
      file++;return Response.json({data:{files:[{file_id:'fixture-file-'+file,requests:[{method:'PUT',url:'https://yce-us.s3.amazonaws.com/fixture-'+file,headers:{'Content-Type':'image/png','Content-Length':'33'}}]}]}});
    }
    if(u.hostname==='yce-us.s3.amazonaws.com')return new Response('',{status:200});
    if(u.pathname==='/s2s/v2.0/task/cloth-v4')return Response.json({data:{task_id:'fixture-task'}});
    throw new Error('Unexpected fixture request');
  },
});
try{
  const response=await mf.dispatchFetch('http://worker-fixture.local/');
  const result=await response.json();
  console.log(JSON.stringify({realProviderRequests:0,unitsUsed:0,result,fixtureCalls:calls}));
  assert.equal(result.ok,true,'Actual adapter failed in native Worker before fixture completion');
  assert.equal(result.id,'fixture-task');assert.equal(calls.length,5);
  for(const [name,expectedCalls] of [['api-redirect',1],['upload-redirect',2]]){
    scenario=name;calls.length=0;
    const rejected=await(await mf.dispatchFetch('http://worker-fixture.local/')).json();
    assert.equal(rejected.ok,false);assert.equal(calls.length,expectedCalls);
    assert.equal(calls.some(x=>x.host==='untrusted.invalid'),false);
    console.log(JSON.stringify({scenario,redirectRejected:true,fixtureCalls:calls.length,realProviderRequests:0,unitsUsed:0}));
  }
}finally{await mf.dispose()}
