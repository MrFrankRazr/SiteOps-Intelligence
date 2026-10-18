import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizedSite,requireMember,customerRoute,verifySiteTxt} from '../src/customer.js';
test('public HTTPS domain roots only',()=>{
 assert.equal(normalizedSite('https://example.com/'),'https://example.com/');
 for(const url of ['http://example.com','https://localhost/','https://127.0.0.1/','https://example.com/a','https://example.com/?q=x','https://user:pass@example.com/'])assert.throws(()=>normalizedSite(url));
});
test('membership query binds user and account, never trusts submitted account',async()=>{
 let values;
 const db={prepare:()=>({bind:(...args)=>{values=args;return {first:async()=>({role:'owner'})};}})};
 assert.equal((await requireMember(db,'u1','a1',true)).role,'owner');assert.deepEqual(values,['u1','a1']);
});
test('viewer cannot write',async()=>{
 const db={prepare:()=>({bind:()=>({first:async()=>({role:'viewer'})})})};
 assert.equal(await requireMember(db,'viewer','account',true),null);
 assert.deepEqual(await requireMember(db,'viewer','account',false),{role:'viewer'});
});
test('account missing membership cannot read or write',async()=>{
 const db={prepare:()=>({bind:()=>({first:async()=>null})})};
 assert.equal(await requireMember(db,'userA','accountB',false),null);
 assert.equal(await requireMember(db,'userA','accountB',true),null);
});
test('customer API off by default, before authentication or database actions',async()=>{
 const res=await customerRoute(new Request('https://worker.test/api/customer/accounts'),{DB:{},CUSTOMER_API_ENABLED:'false'});
 assert.equal(res.status,404);
});
test('invalid pilot bearer rejected',async()=>{
 const res=await customerRoute(new Request('https://worker.test/api/customer/accounts'),{DB:{},CUSTOMER_API_ENABLED:'true'});
 assert.equal(res.status,401);
});
test('DNS TXT verifier does not accept unrelated or forged token',async()=>{
 const token='siteops-verification=abc';
 const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
 const hash=Array.from(new Uint8Array(h),b=>b.toString(16).padStart(2,'0')).join('');
 const site={url:'https://example.com/',verification_token_hash:hash};
 assert.equal(await verifySiteTxt(null,site,async name=>{assert.equal(name,'_siteops-verify.example.com');return ['unrelated',token]}),true);
 assert.equal(await verifySiteTxt(null,site,async()=>['siteops-verification=wrong']),false);
});
