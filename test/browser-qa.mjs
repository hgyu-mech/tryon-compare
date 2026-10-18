import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startFixture,fixturePassword} from './local-fixture-server.mjs';
import {usedUnits} from '../lib/judge-store.mjs';
const require=createRequire(import.meta.url);
const option=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined};
const {chromium}=require(option('--playwright-module')||'playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'.qa','browser-final');await mkdir(dir,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const report={scope:'actual local built worker + offline provider transport fixture',realProviderCalls:0,creditsUsed:0,published:false,checks:[],screenshots:[],assets:[],externalRequestsBlocked:[]};
const sources=['app/route.ts','app/judge/route.ts','app/api/[...path]/route.ts','build/sites-worker.ts','lib/judge-handler.mjs','lib/judge-security.mjs','lib/judge-store.mjs','lib/youcam.mjs','public/app.mjs','public/core.mjs','public/styles.css','public/judge-access.mjs','public/judge.css','assets/fitting-room.html'];
async function sourceHashes(){return Object.fromEntries(await Promise.all(sources.map(async f=>[f,sha(await readFile(path.join(root,f)))])))}
report.sourceBefore=await sourceHashes();
const browser=await chromium.launch({executablePath:option('--browser-executable'),headless:true,args:['--disable-background-networking','--no-first-run']});
let fixture;
async function context(){const c=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});await c.route('**/*',async route=>{const u=new URL(route.request().url());if(['127.0.0.1','localhost'].includes(u.hostname)||['data:','blob:'].includes(u.protocol))await route.continue();else{report.externalRequestsBlocked.push(u.origin);await route.abort()}});return c}
async function screenshot(page,name){const f=path.join(dir,name+'.png');await page.screenshot({path:f,fullPage:true});report.screenshots.push(f)}
try{
 const c=await context(),page=await c.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:9050/',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>document.querySelector('#connection-status')?.textContent.includes('Live generation is off'));
 assert.equal(await page.getByRole('link',{name:'Judge sign-in',exact:true}).count(),1);
 assert.equal(await page.locator('.judge-upload-notice').count(),1);
 assert.match(await page.locator('.judge-upload-notice').innerText(),/30-day retention/);
 assert.equal(await page.locator('.judge-samples a[download]').count(),3);
 assert.equal(await page.locator('input[name*="key" i]').count(),0);
 const config=await page.evaluate(()=>fetch('/api/config').then(r=>r.json()));assert.equal(config.live,false);assert.equal(config.token,'');
 report.checks.push('built worker: anonymous live OFF, three sample download links, 30-day provider notice, no API-key field');
 await screenshot(page,'normal-desktop');
 await page.goto('http://127.0.0.1:9050/judge',{waitUntil:'networkidle'});assert.equal(await page.locator('#judge-password').getAttribute('type'),'password');assert.match(await page.locator('main').innerText(),/provided with this submission/);await screenshot(page,'judge-sign-in');
 report.checks.push('built worker: natural judge sign-in and password input');
 await page.goto('http://127.0.0.1:9050/?replay=1',{waitUntil:'networkidle'});await page.locator('.result-preview[data-result-kind="recorded"] img').nth(1).waitFor();
 assert.match(await page.locator('#replay-banner').innerText(),/No new generation or units/);assert.equal(await page.locator('.judge-upload-notice').count(),0);
 await screenshot(page,'recorded-desktop');
 await page.setViewportSize({width:375,height:900});await screenshot(page,'recorded-mobile-375');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const positions=await page.locator('.candidate').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width}}));assert.equal(positions[0].x,positions[1].x);assert.equal(positions[0].width,positions[1].width);assert.ok(positions[1].y>positions[0].y);
 for(const size of [320,1440]){await page.setViewportSize({width:size,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)}
 report.checks.push('built worker: clearly labeled two-result replay, one-column mobile, no horizontal overflow at 320/375/1440');
 const manifest=JSON.parse(await readFile(path.join(root,'public/demo-manifest.json'),'utf8'));
 for(const item of [manifest.person,...manifest.candidates.flatMap(x=>[x.garment,x.result])]){const b=await readFile(path.join(root,'public',item.url));assert.equal(sha(b),item.sha256);report.assets.push({url:item.url,sha256:sha(b),bytes:b.length})}
 for(const name of ['app.mjs','core.mjs','styles.css','favicon.svg'])assert.equal(sha(await readFile(path.join(root,'public',name))),sha(await readFile(path.join(root,'..','public',name))));
 assert.equal(sha(await readFile(path.join(root,'assets/original-index.html'))),sha(await readFile(path.join(root,'../public/index.html'))));
 report.checks.push('five input/result hashes match recorded manifest; preserved original HTML/CSS/JS/favicon byte-identical');
 assert.deepEqual(errors,[]);report.checks.push('actual built worker pages have no JavaScript page errors');await c.close();
 fixture=await startFixture();const fctx=await context(),fp=await fctx.newPage();
 await fp.goto(fixture.url+'/judge');await fp.getByLabel('Access code').fill(fixturePassword);await fp.getByRole('button',{name:'Open the fitting room'}).click();
 await fp.waitForFunction(()=>document.querySelector('#connection-status')?.textContent.startsWith('Live try-on.'));
 assert.equal(await fp.getByRole('button',{name:'Sign out',exact:true}).count(),1);assert.equal(fixture.calls.length,0);
 await fp.locator('#person-file').setInputFiles(path.join(root,'public/demo-inputs/person.png'));
 await fp.locator('.garment-file').nth(0).setInputFiles(path.join(root,'public/demo-inputs/navy.png'));
 await fp.locator('.garment-file').nth(1).setInputFiles(path.join(root,'public/demo-inputs/olive.png'));
 await fp.locator('#person-preview img').waitFor();await fp.locator('.product-preview img').nth(1).waitFor();
 await fp.waitForTimeout(100);assert.equal(await fp.locator('.generate').nth(0).isDisabled(),true);assert.equal(fixture.calls.length,0);
 await fp.locator('#upload-consent').check();await fp.locator('.generate').nth(0).click();await fp.locator('.result-preview[data-result-kind="live"] img').waitFor();
 assert.equal(fixture.creates,1);assert.equal(await usedUnits(fixture.DB),2);assert.equal(fixture.calls.filter(x=>x.method==='PUT').length,2);
 await fp.waitForFunction(()=>document.querySelector('.result-preview img')?.naturalWidth>0);
 const img=await fp.locator('.result-preview img').getAttribute('src');assert.match(img,/^\/api\/results\//);
 await fp.locator('.decision-choice').nth(0).selectOption('shortlist');await fp.locator('.decision-choice').nth(1).selectOption('skip');
 await fp.getByLabel('Product name',{exact:true}).nth(0).fill('Offline fixture navy');await fp.getByLabel('Price',{exact:true}).nth(0).fill('39');await fp.getByLabel('Wardrobe match / reason',{exact:true}).nth(0).fill('Offline browser test note');
 await fp.locator('#save-board').click();await screenshot(fp,'offline-fixture-result-and-notes');
 const stored=await fp.evaluate(()=>localStorage.getItem('tryon-compare.metadata.v1'));assert.doesNotMatch(stored,/base64|imageUrl|taskId|s3\.amazonaws|api\/results|fixture-key/);assert.match(stored,/Offline browser test note/);
 const prior=fixture.calls.length;await fp.reload({waitUntil:'networkidle'});assert.equal(await fp.locator('.result-preview img').count(),0);assert.equal(await fp.locator('#person-preview img').count(),0);assert.equal(await fp.locator('.decision-choice').nth(0).inputValue(),'shortlist');assert.equal(await fp.locator('.decision-choice').nth(1).inputValue(),'skip');assert.equal(fixture.calls.length,prior);
 await fp.getByRole('button',{name:'Sign out',exact:true}).click();await fp.waitForFunction(()=>document.querySelector('#connection-status')?.textContent.includes('Live generation is off'));
 report.checks.push('offline fixture: login, full-file decode, consent gate, upload/start/status/private proxy, decisions/notes, reload excludes photos/results, sign out; simulated task only');
 report.fixture={protocolCalls:fixture.calls,simulatedTasks:fixture.creates,simulatedLedgerUnits:await usedUnits(fixture.DB),realProviderCalls:0,resultSource:'previously-generated local navy JPEG; offline QA only, not new provider output'};
 await fctx.close();report.sourceAfter=await sourceHashes();assert.deepEqual(report.sourceAfter,report.sourceBefore);report.sourceStable=true;report.passed=true;
}catch(error){report.passed=false;report.error=error.stack;throw error}
finally{await browser.close();if(fixture)await fixture.close();await writeFile(path.join(dir,'report.private.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,report:path.join(dir,'report.private.json'),error:report.error?.split('\n')[0]}))}
