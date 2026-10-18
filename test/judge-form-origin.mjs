// Browser regression against the actual built Worker; no valid credentials,
// photos, task creation or provider calls. Install Playwright separately.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=new URL(process.argv[2]||'http://127.0.0.1:9050').origin;
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
const report={origin,validCredentialsUsed:false,providerCalls:0,formPost:null};
try{
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();
  page.on('request',request=>{
    if(new URL(request.url()).pathname==='/api/judge/login')report.formPost={method:request.method(),origin:request.headers().origin||null};
  });
  const document=await page.goto(origin+'/judge',{waitUntil:'networkidle'});
  report.documentReferrerPolicy=document.headers()['referrer-policy'];
  await page.getByLabel('Access code').fill('invalid-regression-fixture-only');
  const responsePromise=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/judge/login');
  await page.getByRole('button',{name:'Open the fitting room'}).click();
  const response=await responsePromise;
  report.status=response.status();
  assert.equal(report.formPost?.origin,origin,'Native same-origin form lost its Origin before reaching the API');
  assert.notEqual(report.status,403,'Same-origin form must pass origin validation even when access code/configuration is invalid');
  report.pass=true;
}catch(error){report.pass=false;report.error=error.message;process.exitCode=1}
finally{await browser.close();console.log(JSON.stringify(report))}
