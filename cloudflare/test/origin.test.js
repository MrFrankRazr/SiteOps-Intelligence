import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
const publicOrigin='https://siteops-scanner-test.paddockcommand.workers.dev';
const env={SCAN_API_KEY:'valid-key',DASHBOARD_ORIGIN:publicOrigin,TEST_TARGET:'https://mrfrankrazr.github.io/SiteOps-Intelligence/',DB:{}};
const loginRequest=(url,origin,secFetchSite)=>{const form=new FormData();form.set('key','valid-key');return new Request(url+'/login',{method:'POST',headers:{origin,...(secFetchSite?{'sec-fetch-site':secFetchSite}:{})},body:form});};
test('public login succeeds when upstream request URL differs from browser origin',async()=>{
 const res=await worker.fetch(loginRequest('https://internal-route.invalid',publicOrigin,'same-origin'),env);
 assert.equal(res.status,303);
 assert.match(res.headers.get('set-cookie'),/HttpOnly; Secure/);
});
test('untrusted origin remains blocked',async()=>{
 const res=await worker.fetch(loginRequest('https://internal-route.invalid','https://attacker.invalid','cross-site'),env);
 assert.equal(res.status,403);
});
test('cross-site fetch metadata remains blocked even if origin is forged',async()=>{
 const res=await worker.fetch(loginRequest('https://internal-route.invalid',publicOrigin,'cross-site'),env);
 assert.equal(res.status,403);
});
