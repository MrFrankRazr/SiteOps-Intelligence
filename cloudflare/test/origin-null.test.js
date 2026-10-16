import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
const base='https://siteops-scanner-test.paddockcommand.workers.dev';
const env={SCAN_API_KEY:'valid-key',DASHBOARD_ORIGIN:base,TEST_TARGET:'https://mrfrankrazr.github.io/SiteOps-Intelligence/',DB:{}};
const headers={'origin':'null','sec-fetch-site':'same-origin','sec-fetch-mode':'navigate'};
function req(nonce,cookie,overrides={}) {const form=new FormData();form.set('key','valid-key');if(nonce)form.set('csrf',nonce);return new Request(base+'/login',{method:'POST',headers:{...headers,...overrides,...(cookie?{'cookie':cookie}:{})},body:form});}
test('null origin same-origin login succeeds with form CSRF token',async()=>{
 const page=await worker.fetch(new Request(base+'/dashboard'),env);
 const nonce=(await page.text()).match(/name="csrf" value="([a-f0-9-]{36})"/)[1];
 const cookie=page.headers.get('set-cookie').split(';')[0];
 const result=await worker.fetch(req(nonce,cookie),env);
 assert.equal(result.status,303);
 assert.match(result.headers.get('set-cookie'),/siteops_session=/);
});
test('null origin without form nonce is rejected',async()=>assert.equal((await worker.fetch(req(null,null),env)).status,403));
test('null origin from cross-site request is rejected',async()=>assert.equal((await worker.fetch(req(null,null,{'sec-fetch-site':'cross-site'}),env)).status,403));
test('null origin from non-navigation is rejected',async()=>assert.equal((await worker.fetch(req(null,null,{'sec-fetch-mode':'cors'}),env)).status,403));
test('forged CSRF nonce is rejected',async()=>assert.equal((await worker.fetch(req('11111111-1111-4111-8111-111111111111','__Host-siteops_csrf=22222222-2222-4222-8222-222222222222'),env)).status,403));
