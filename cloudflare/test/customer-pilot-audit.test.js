import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizePilotDryRun} from '../src/customer-pilot-audit.js';
const account='3eed56c9-91ed-4be1-897b-ace60995635c';
const site='658c5e7c-d5e9-46ea-8b6e-794649b74a90';
const target='https://siteops-test.paddockcommand.com/';
const flags={CUSTOMER_API_ENABLED:'true',CUSTOMER_MONITORING_CONTROLS_ENABLED:'true',CUSTOMER_PILOT_AUDIT_ENABLED:'true',CUSTOMER_PILOT_ACCOUNT_ID:account,CUSTOMER_PILOT_SITE_ID:site,CUSTOMER_PILOT_TARGET:target};
const row={account_id:account,site_id:site,site_url:target,verification_state:'verified',monitoring_enabled:1,account_status:'active'};
function db(record=row) { let calls=0;return {get calls(){return calls},prepare(){calls++;return {bind(){return {async first(){return record}}}}}} }
test('audit disabled by default without touching database',async()=>{const d={prepare(){throw Error('must not query')}};assert.equal((await summarizePilotDryRun(d,{})).state,'disabled')});
test('audit requires separate explicit opt-in',async()=>{const d=db();assert.equal((await summarizePilotDryRun(d,{...flags,CUSTOMER_PILOT_AUDIT_ENABLED:'false'})).state,'disabled');assert.equal(d.calls,0)});
test('all upstream feature flags must remain enabled',async()=>{for(const k of ['CUSTOMER_API_ENABLED','CUSTOMER_MONITORING_CONTROLS_ENABLED']){const d=db();assert.equal((await summarizePilotDryRun(d,{...flags,[k]:'false'})).state,'disabled');assert.equal(d.calls,0)}});
test('eligible pilot produces count only with the scan flag absent',async()=>{const result=await summarizePilotDryRun(db(),flags);assert.deepEqual(result,{dryRun:true,scheduledScanningActive:false,eligibleCount:1,state:'eligible'});assert.ok(!JSON.stringify(result).includes(account));assert.ok(!JSON.stringify(result).includes(target))});
test('ineligible pilot yields sanitized zero count',async()=>{const r=await summarizePilotDryRun(db({...row,monitoring_enabled:0}),flags);assert.deepEqual(r,{dryRun:true,scheduledScanningActive:false,eligibleCount:0,state:'ineligible'})});
test('missing row yields zero count',async()=>{const r=await summarizePilotDryRun(db(null),flags);assert.equal(r.eligibleCount,0);assert.equal(r.state,'ineligible')});
test('cross-tenant row is ineligible',async()=>{const r=await summarizePilotDryRun(db({...row,account_id:'192aaad0-5d2e-4001-877c-0be50ac2556d'}),flags);assert.equal(r.eligibleCount,0)});
test('missing D1 fails closed',async()=>{const r=await summarizePilotDryRun(null,flags);assert.equal(r.state,'unavailable');assert.equal(r.scheduledScanningActive,false)});
test('D1 failure does not disclose exception',async()=>{const d={prepare(){throw Error('secret database SQL connection')}};const r=await summarizePilotDryRun(d,flags);assert.equal(r.state,'unavailable');assert.ok(!JSON.stringify(r).includes('secret'))});
test('verification disabled after selection is ineligible',async()=>{const r=await summarizePilotDryRun(db({...row,verification_state:'pending'}),flags);assert.equal(r.state,'ineligible')});
test('no schedule or network actions can be returned',async()=>{const r=await summarizePilotDryRun(db(),flags);assert.deepEqual(Object.keys(r).sort(),['dryRun','eligibleCount','scheduledScanningActive','state']);assert.equal(r.scheduledScanningActive,false)});

test('audit evaluates an eligible pilot with scanning explicitly disabled',async()=>{
  const result=await summarizePilotDryRun(db(),{...flags,CUSTOMER_PILOT_SCAN_ENABLED:'false'});
  assert.deepEqual(result,{dryRun:true,scheduledScanningActive:false,eligibleCount:1,state:'eligible'});
});
