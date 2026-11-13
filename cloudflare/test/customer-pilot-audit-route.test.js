import test from 'node:test';
import assert from 'node:assert/strict';
import {customerPilotAuditRoute} from '../src/customer-pilot-audit-route.js';
const A='3eed56c9-91ed-4be1-897b-ace60995635c';
const B='192aaad0-5d2e-4001-877c-0be50ac2556d';
const SITE='658c5e7c-d5e9-46ea-8b6e-794649b74a90';
const base=`https://siteops-customer-staging.paddockcommand.workers.dev/api/customer/accounts/${A}/pilot-audit`;
const token='a'.repeat(64);
let queries=[];
function database(role='owner', state='pilot'){
 return {prepare(sql) {
   queries.push(sql);
   return {bind(...args) {
     return {async first() {
       if(sql.includes('FROM customer_access_tokens'))return {user_id:'test-user'};
       if(sql.includes('FROM account_members'))return role?{role}:null;
       if(sql.includes('FROM monitored_sites'))return {
         site_id:SITE,account_id:A,site_url:'https://siteops-test.paddockcommand.com/',
         verification_state:'verified',monitoring_enabled:1,account_status:state};
       throw Error('unexpected SQL');
     }};
   }};
 }};
}
function environment(role='owner',state='pilot'){
 queries=[];
 return {DB:database(role,state),CUSTOMER_PILOT_AUDIT_ROUTE_ENABLED:'true',
   CUSTOMER_PILOT_AUDIT_ENABLED:'true',CUSTOMER_API_ENABLED:'true',
   CUSTOMER_MONITORING_CONTROLS_ENABLED:'true',CUSTOMER_PILOT_SCAN_ENABLED:'true',
   CUSTOMER_PILOT_ACCOUNT_ID:A,CUSTOMER_PILOT_SITE_ID:SITE,
   CUSTOMER_PILOT_TARGET:'https://siteops-test.paddockcommand.com/'};
}
const request=(url=base,method='GET',auth=true)=>new Request(url,{
 method,headers:auth?{authorization:`Bearer ${token}`}:{}
});
test('unrelated paths ignored',async()=>assert.equal(await customerPilotAuditRoute(new Request('https://x.test/health'),{}),null));
test('disabled by default, no D1 reads',async()=>{
 const e=environment();delete e.CUSTOMER_PILOT_AUDIT_ROUTE_ENABLED;
 const r=await customerPilotAuditRoute(request(),e);
 assert.equal(r.status,404);assert.equal(queries.length,0);
});
test('disabled customer API returns 404',async()=>{
 const e=environment();e.CUSTOMER_API_ENABLED='false';
 assert.equal((await customerPilotAuditRoute(request(),e)).status,404);
});
test('POST not supported and never queries D1',async()=>{
 const r=await customerPilotAuditRoute(request(base,'POST'),environment());
 assert.equal(r.status,405);assert.equal(queries.length,0);
});
test('unauthenticated users rejected',async()=>{
 const r=await customerPilotAuditRoute(request(base,'GET',false),environment());
 assert.equal(r.status,401);
});
test('viewer denied without querying sites',async()=>{
 const r=await customerPilotAuditRoute(request(),environment('viewer'));
 assert.equal(r.status,404);assert.equal(queries.some(x=>x.includes('FROM monitored_sites')),false);
});
test('missing membership denied',async()=>{
 assert.equal((await customerPilotAuditRoute(request(),environment(null))).status,404);
});
test('cross-account access denied before audit query',async()=>{
 const url=base.replace(A,B);
 const r=await customerPilotAuditRoute(request(url),environment());
 assert.equal(r.status,404);
 assert.equal(queries.some(x=>x.includes('FROM monitored_sites')),false);
});
test('pilot owner sees only sanitized dry-run summary',async()=>{
 const r=await customerPilotAuditRoute(request(),environment('owner'));
 assert.equal(r.status,200);
 const value=await r.json();
 assert.deepEqual(value,{dryRun:true,scheduledScanningActive:false,eligibleCount:1,state:'eligible'});
 assert.equal(JSON.stringify(value).includes(A),false);
 assert.equal(r.headers.get('cache-control'),'no-store');
});
test('active admin allowed',async()=>{
 const r=await customerPilotAuditRoute(request(),environment('admin','active'));
 assert.equal((await r.json()).state,'eligible');
});
test('suspended account ineligible',async()=>{
 const r=await customerPilotAuditRoute(request(),environment('owner','suspended'));
 const data=await r.json();assert.equal(data.eligibleCount,0);
});
test('unavailable database gracefully fails',async()=>{
 const r=await customerPilotAuditRoute(request(),{CUSTOMER_PILOT_AUDIT_ROUTE_ENABLED:'true',CUSTOMER_API_ENABLED:'true'});
 assert.equal(r.status,503);
});
