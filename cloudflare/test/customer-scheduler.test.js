import test from 'node:test';
import assert from 'node:assert/strict';
import {customerSchedulerEnabled,normalizeBatchSize,listEligibleCustomerSites,customerSchedulerDryRun} from '../src/customer-scheduler.js';
const enabled={CUSTOMER_API_ENABLED:'true',CUSTOMER_SCHEDULER_ENABLED:'true'};
function mock(rows=[]) {
 const calls=[];
 return {calls,prepare(sql){calls.push({sql});return {bind(limit){calls.at(-1).limit=limit;return {async all(){return {results:rows};}};}};}};
}
test('scheduler disabled by default and requires both flags',()=>{
 assert.equal(customerSchedulerEnabled({}),false);
 assert.equal(customerSchedulerEnabled({CUSTOMER_SCHEDULER_ENABLED:'true'}),false);
 assert.equal(customerSchedulerEnabled({CUSTOMER_API_ENABLED:'true'}),false);
 assert.equal(customerSchedulerEnabled(enabled),true);
});
test('disabled scheduler does not touch D1',async()=>{
 const d={prepare(){throw Error('D1 must not be touched');}};
 assert.deepEqual(await listEligibleCustomerSites(d,{CUSTOMER_API_ENABLED:'true'}),[]);
});
test('batch is bounded by hard limit of ten',()=>{
 assert.equal(normalizeBatchSize(),5);
 assert.equal(normalizeBatchSize(1),1);
 assert.equal(normalizeBatchSize(10),10);
 for(const x of [0,11,-1,1.2,'5'])assert.throws(()=>normalizeBatchSize(x),RangeError);
});
test('query requires verified monitored sites from active accounts',async()=>{
 const d=mock([]);
 await listEligibleCustomerSites(d,enabled,{limit:3});
 const sql=d.calls[0].sql;
 assert.match(sql,/s\.monitoring_enabled\s*=\s*1/);
 assert.match(sql,/s\.verification_state\s*=\s*'verified'/);
 assert.match(sql,/a\.status\s*=\s*'active'/);
 assert.match(sql,/JOIN accounts a ON a\.id = s\.account_id/);
 assert.equal(d.calls[0].limit,3);
});
test('eligible records retain tenant and site IDs',async()=>{
 const row={account_id:'account-A',site_id:'site-A',url:'https://example.com/'};
 const result=await listEligibleCustomerSites(mock([row]),enabled);
 assert.deepEqual(result,[{accountId:'account-A',siteId:'site-A',url:'https://example.com/'}]);
});
test('dry run never runs scans, writes data, or schedules jobs',async()=>{
 const d=mock([{account_id:'a',site_id:'s',url:'https://example.com/'}]);
 assert.deepEqual(await customerSchedulerDryRun(d,enabled),{
  dryRun:true,scheduledScanningActive:false,eligibleCount:1,sites:[{accountId:'a',siteId:'s',url:'https://example.com/'}]
 });
 assert.equal(d.calls.length,1);
});
test('malformed D1 response is rejected',async()=>{
 const d={prepare(){ return {bind(){ return {async all(){ return {}; }}; }}; }};
 await assert.rejects(listEligibleCustomerSites(d,enabled),/Unexpected D1 result/);
});
