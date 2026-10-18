import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveOwnershipTxt} from '../src/customer-dns.js';
import {customerRoute} from '../src/customer.js';

test('DNS verifier uses only fixed Cloudflare HTTPS resolver and TXT type',async()=>{
 const name='_siteops-verify.example.com';
 const result=await resolveOwnershipTxt(name,async (url,opts)=>{
  const u=new URL(url);
  assert.equal(u.origin,'https://cloudflare-dns.com');
  assert.equal(u.pathname,'/dns-query');
  assert.equal(u.searchParams.get('name'),name);
  assert.equal(u.searchParams.get('type'),'TXT');
  assert.equal(opts.redirect,'error');
  return {ok:true,json:async()=>({Status:0,Answer:[
   {name:name+'.',type:16,data:'"siteops-verification=correct"'},
   {name:'_siteops-verify.attacker.com.',type:16,data:'"siteops-verification=forged"'},
   {name:name+'.',type:1,data:'1.2.3.4'}]})};
 });
 assert.deepEqual(result,['siteops-verification=correct']);
});
test('DNS resolver rejects invalid hostnames before network',async()=>{
 let called=false;
 await assert.rejects(resolveOwnershipTxt('_siteops-verify.localhost',()=>{called=true;}));
 assert.equal(called,false);
});
test('pilot is disabled unless explicitly enabled, regardless of provided credential',async()=>{
 const req=new Request('https://worker.example/api/customer/accounts',{headers:{authorization:'Bearer '+'a'.repeat(64)}});
 const res=await customerRoute(req,{CUSTOMER_API_ENABLED:'false',DB:{prepare(){throw Error('database should not be used')}}});
 assert.equal(res.status,404);
});
