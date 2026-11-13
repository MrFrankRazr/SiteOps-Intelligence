import test from 'node:test';
import assert from 'node:assert/strict';
import {decidePilotScan} from '../src/customer-pilot-gate.js';
import {pilotEligibilityDryRun} from '../src/customer-pilot-dryrun.js';
const accountId='3eed56c9-91ed-4be1-897b-ace60995635c';
const siteId='658c5e7c-d5e9-46ea-8b6e-794649b74a90';
const target='https://siteops-test.paddockcommand.com/';
const env={CUSTOMER_API_ENABLED:'true', CUSTOMER_MONITORING_CONTROLS_ENABLED:'true', CUSTOMER_PILOT_SCAN_ENABLED:'true', CUSTOMER_PILOT_ACCOUNT_ID:accountId, CUSTOMER_PILOT_SITE_ID:siteId, CUSTOMER_PILOT_TARGET:target};
const input={accountId,siteId,accountStatus:'pilot',verificationState:'verified',monitoringEnabled:true,siteUrl:target};
const makeDb=status=>({prepare(){return {bind(){return {async first(){return {account_id:accountId,site_id:siteId,site_url:target,verification_state:'verified',monitoring_enabled:1,account_status:status};}};}};}});
test('pilot account status is allowed only when all pinned conditions hold',()=>assert.equal(decidePilotScan(input,env).allowed,true));
test('active account status continues to be allowed',()=>assert.equal(decidePilotScan({...input,accountStatus:'active'},env).allowed,true));
test('suspended, absent and unrecognized account statuses are denied',()=>{
  for(const accountStatus of ['suspended','',undefined,'inactive','PILOT',null])assert.equal(decidePilotScan({...input,accountStatus},env).allowed,false, String(accountStatus));
});
test('dry-run accepts pinned pilot and active records',async()=>{
  for(const status of ['pilot','active']) {
    const result=await pilotEligibilityDryRun(makeDb(status),env);
    assert.equal(result.eligibleCount,1,status);
    assert.equal(result.scheduledScanningActive,false);
  }
});
test('dry-run rejects suspended and unknown account statuses',async()=>{
  for(const status of ['suspended','disabled',null])assert.equal((await pilotEligibilityDryRun(makeDb(status),env)).eligibleCount,0);
});
test('pilot status does not bypass verification or monitoring preference',()=>{
  assert.equal(decidePilotScan({...input,verificationState:'revoked'},env).allowed,false);
  assert.equal(decidePilotScan({...input,monitoringEnabled:false},env).allowed,false);
});
