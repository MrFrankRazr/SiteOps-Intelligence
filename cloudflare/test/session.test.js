import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
const url='https://siteops-scanner-test.paddockcommand.workers.dev';
const env={SCAN_API_KEY:'secret-for-tests',TEST_TARGET:'https://mrfrankrazr.github.io/SiteOps-Intelligence/',DB:{prepare(){return {bind(){return {all:async()=>({results:[]})}}}}}};
test('successful login sets secure HttpOnly session',async()=>{const form=new FormData();form.set('key','secret-for-tests');const r=await worker.fetch(new Request(url+'/login',{method:'POST',body:form,headers:{origin:url}}),env);assert.equal(r.status,303);assert.match(r.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);const cookie=r.headers.get('set-cookie').split(';')[0];const d=await worker.fetch(new Request(url+'/dashboard',{headers:{cookie}}),env);assert.equal(d.status,200);assert.match(await d.text(),/Run Scan/)});
test('incorrect key is rejected',async()=>{const form=new FormData();form.set('key','invalid');const r=await worker.fetch(new Request(url+'/login',{method:'POST',body:form,headers:{origin:url}}),env);assert.equal(r.status,401)});
test('cross-origin POST is rejected',async()=>{const r=await worker.fetch(new Request(url+'/login',{method:'POST',headers:{origin:'https://untrusted.invalid'},body:'x'}),env);assert.equal(r.status,403)});
