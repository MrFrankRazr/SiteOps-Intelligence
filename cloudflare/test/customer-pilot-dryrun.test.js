import test from 'node:test';
import assert from 'node:assert/strict';
import {pilotEligibilityDryRun} from '../src/customer-pilot-dryrun.js';
const accountId='3eed56c9-91ed-4be1-897b-ace60995635c';
const siteId='658c5e7c-d5e9-46ea-8b6e-794649b74a90';
const url='https://siteops-test.paddockcommand.com/';
const env={CUSTOMER_API_ENABLED:'true',CUSTOMER_MONITORING_CONTROLS_ENABLED:'true',CUSTOMER_PILOT_SCAN_ENABLED:'true',CUSTOMER_PILOT_ACCOUNT_ID:accountId,CUSTOMER_PILOT_SITE_ID:siteId,CUSTOMER_PILOT_TARGET:url};
const row={account_id:accountId,site_id:siteId,site_url:url,verification_state:'verified',monitoring_enabled:1,account_status:'active'};
function fakeDb(record=row) {
  const q={};
  return {
    q,
    prepare(sql) {
      q.sql=sql;
      return {bind(...args) {
        q.args=args;
        return {async first() {q.called=true;return record;}};
      }};
    }
  };
}
test('pilot disabled by default and no DB operations',async()=>{
  const db={prepare(){throw Error('query not allowed')}};
  assert.equal((await pilotEligibilityDryRun(db,{})).eligibleCount,0);
});
test('all three gates required; no query when disabled',async()=>{
  for(const flag of ['CUSTOMER_API_ENABLED','CUSTOMER_MONITORING_CONTROLS_ENABLED','CUSTOMER_PILOT_SCAN_ENABLED']){
    const db={prepare(){throw Error('query not allowed')}};
    assert.equal((await pilotEligibilityDryRun(db,{...env,[flag]:'false'})).eligibleCount,0);
  }
});
test('missing pin identifiers fail closed without query',async()=>{
  const db={prepare(){throw Error('query not allowed')}};
  assert.equal((await pilotEligibilityDryRun(db,{...env,CUSTOMER_PILOT_SITE_ID:null})).eligibleCount,0);
});
test('uses bound account and site IDs rather than SQL concatenation',async()=>{
  const {q,...db}=fakeDb(); const r=await pilotEligibilityDryRun(db,env);
  assert.equal(r.eligibleCount,1);assert.equal(r.scheduledScanningActive,false);
  assert.deepEqual(q.args,[accountId,siteId]);
  assert.match(q.sql,/WHERE s.account_id=\? AND s.id=\? LIMIT 1/);
  assert.ok(!q.sql.includes(accountId));
});
test('returns empty when no tenant-owned site exists',async()=>{
  const {q,...db}=fakeDb(null);const r=await pilotEligibilityDryRun(db,env);
  assert.equal(r.eligibleCount,0);assert.deepEqual(r.sites,[]);
});
test('denies unverified sites',async()=>{
  assert.equal((await pilotEligibilityDryRun(fakeDb({...row,verification_state:'pending'}),env)).eligibleCount,0);
});
test('denies monitoring turned off',async()=>{
  assert.equal((await pilotEligibilityDryRun(fakeDb({...row,monitoring_enabled:0}),env)).eligibleCount,0);
});
test('denies inactive accounts',async()=>{
  assert.equal((await pilotEligibilityDryRun(fakeDb({...row,account_status:'suspended'}),env)).eligibleCount,0);
});
test('denies cross-account rows',async()=>{
  assert.equal((await pilotEligibilityDryRun(fakeDb({...row,account_id:'192aaad0-5d2e-4001-877c-0be50ac2556d'}),env)).eligibleCount,0);
});
test('denies tampered destinations',async()=>{
  assert.equal((await pilotEligibilityDryRun(fakeDb({...row,site_url:'https://example.org/'}),env)).eligibleCount,0);
});
test('never grants scheduled execution from an eligible row',async()=>{
  const r=await pilotEligibilityDryRun(fakeDb(),env);
  assert.equal(r.dryRun,true);assert.equal(r.scheduledScanningActive,false);
  assert.deepEqual(r.sites,[{accountId,siteId,url}]);
});
test('enabled pilot requires a D1 binding',async()=>{
  await assert.rejects(pilotEligibilityDryRun(null,env),TypeError);
});
