import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
const base='https://siteops-scanner-test.paddockcommand.workers.dev';
const env={SCAN_API_KEY:'valid-key',DASHBOARD_ORIGIN:base,TEST_TARGET:'https://mrfrankrazr.github.io/SiteOps-Intelligence/',DB:{}};
const nav={'origin':'null','sec-fetch-site':'same-origin','sec-fetch-mode':'navigate'};
async function login(){
 const page=await worker.fetch(new Request(base+'/dashboard'),env);
 const nonce=(await page.text()).match(/name="csrf" value="([a-f0-9-]{36})"/)[1];
 const cookie=page.headers.get('set-cookie').split(';')[0];
 const form=new FormData();form.set('key','valid-key');form.set('csrf',nonce);
 const response=await worker.fetch(new Request(base+'/login',{method:'POST',headers:{...nav,cookie},body:form}),env);
 assert.equal(response.status,303);
 return response.headers.get('set-cookie').split(';')[0];
}
async function dashboard(session){
 const page=await worker.fetch(new Request(base+'/dashboard',{headers:{cookie:session}}),env);
 assert.equal(page.status,200);
 const nonce=(await page.text()).match(/action="\/logout"><input type="hidden" name="csrf" value="([a-f0-9-]{36})"/)[1];
 return {nonce,cookie:page.headers.get('set-cookie').split(';')[0]};
}
function logout(session,nonce,csrfCookie,overrides={}){
 const form=new FormData();if(nonce)form.set('csrf',nonce);
 return worker.fetch(new Request(base+'/logout',{method:'POST',headers:{...nav,...overrides,cookie:[session,csrfCookie].filter(Boolean).join('; ')},body:form}),env);
}
test('same-origin null origin logout succeeds with a CSRF token',async()=>{
 const session=await login();const {nonce,cookie}=await dashboard(session);
 const result=await logout(session,nonce,cookie);
 assert.equal(result.status,303);
 assert.match(result.headers.get('set-cookie'),/Max-Age=0/);
});
test('logout rejects missing CSRF token',async()=>{
 const session=await login();const {cookie}=await dashboard(session);
 assert.equal((await logout(session,null,cookie)).status,403);
});
test('logout rejects cross-site null-origin request',async()=>{
 const session=await login();const {nonce,cookie}=await dashboard(session);
 assert.equal((await logout(session,nonce,cookie,{'sec-fetch-site':'cross-site'})).status,403);
});
test('logout rejects unauthenticated requests',async()=>{
 const form=new FormData();form.set('csrf','123');
 assert.equal((await worker.fetch(new Request(base+'/logout',{method:'POST',headers:nav,body:form}),env)).status,401);
});
