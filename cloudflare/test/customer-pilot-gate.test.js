import test from 'node:test';
import assert from 'node:assert/strict';
import {decidePilotScan} from '../src/customer-pilot-gate.js';
const a='3eed56c9-91ed-4be1-897b-ace60995635c';
const s='658c5e7c-d5e9-46ea-8b6e-794649b74a90';
const target='https://siteops-test.paddockcommand.com/';
const input={accountId:a,siteId:s,accountStatus:'active',verificationState:'verified',monitoringEnabled:true,siteUrl:target};
const env={CUSTOMER_API_ENABLED:'true',CUSTOMER_MONITORING_CONTROLS_ENABLED:'true',CUSTOMER_PILOT_SCAN_ENABLED:'true',CUSTOMER_PILOT_ACCOUNT_ID:a,CUSTOMER_PILOT_SITE_ID:s,CUSTOMER_PILOT_TARGET:target};
test('denied by default without any environment configuration',()=>assert.equal(decidePilotScan(input).allowed,false));
test('three flags must be exactly enabled',()=>{
  for(const key of ['CUSTOMER_API_ENABLED','CUSTOMER_MONITORING_CONTROLS_ENABLED','CUSTOMER_PILOT_SCAN_ENABLED'])assert.equal(decidePilotScan(input,{...env,[key]:'false'}).allowed,false);
});
test('fully pinned verified active monitored test site can be selected',()=>{
  const result=decidePilotScan(input,env);assert.equal(result.allowed,true);assert.equal(result.target,target);assert.equal(Object.isFrozen(result),true);
});
test('unverified website denied',()=>assert.equal(decidePilotScan({...input,verificationState:'pending'},env).allowed,false));
test('disabled monitoring denied',()=>assert.equal(decidePilotScan({...input,monitoringEnabled:false},env).allowed,false));
test('inactive accounts denied',()=>assert.equal(decidePilotScan({...input,accountStatus:'suspended'},env).allowed,false));
test('cross-account and cross-site jobs denied',()=>{
  const other='192aaad0-5d2e-4001-877c-0be50ac2556d';
  assert.equal(decidePilotScan({...input,accountId:other},env).allowed,false);
  assert.equal(decidePilotScan({...input,siteId:other},env).allowed,false);
});
test('different target or differing path denied',()=>{
  for(const siteUrl of ['https://example.com/','https://siteops-test.paddockcommand.com/other','https://siteops-test.paddockcommand.com/?a=1'])assert.equal(decidePilotScan({...input,siteUrl},env).allowed,false);
});
test('URL credentials fragments and port variants denied',()=>{
  for(const siteUrl of ['https://user@siteops-test.paddockcommand.com/','https://siteops-test.paddockcommand.com/#x','https://siteops-test.paddockcommand.com:443/'])assert.equal(decidePilotScan({...input,siteUrl},env).allowed,false);
});
test('malformed input, unpinned config and invalid identifiers denied',()=>{
  for(const v of [null,[],{}, {...input,accountId:'foo'}])assert.equal(decidePilotScan(v,env).allowed,false);
  assert.equal(decidePilotScan(input,{...env,CUSTOMER_PILOT_TARGET:'https://other.example/'}).allowed,false);
});
