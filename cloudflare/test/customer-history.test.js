import test from 'node:test';
import assert from 'node:assert/strict';
import {customerHistoryRoute} from '../src/customer-history.js';
const ACCOUNT_A='11111111-1111-4111-8111-111111111111';
const ACCOUNT_B='22222222-2222-4222-8222-222222222222';
const SITE_A='33333333-3333-4333-8333-333333333333';
const ORIGIN='https://siteops-customer-staging.paddockcommand.workers.dev';
const TOKEN='a'.repeat(64);
const request=(account=ACCOUNT_A,site=SITE_A,kind='scans',token=TOKEN,method='GET')=>new Request(`${ORIGIN}/api/customer/accounts/${account}/sites/${site}/${kind}`,{method,headers:{authorization:`Bearer ${token}`}});
function mockDb({member='owner',site=true}={}){
 const queries=[];
 return {queries,prepare(sql){return {bind(...params){queries.push({sql,params});return {
  async first(){
   if(sql.includes('FROM customer_access_tokens'))return {user_id:'user-a'};
   if(sql.includes('FROM account_members'))return member?{role:member}:null;
   if(sql.includes('FROM monitored_sites'))return site?{id:SITE_A}:null;
   return null;
  },
  async all(){return {results:[]};}
 };}};}};
}
test('history endpoints are disabled by customer feature flag',async()=>{
 const r=await customerHistoryRoute(request(),{CUSTOMER_API_ENABLED:'false'});
 assert.equal(r.status,404);
});
test('invalid bearer is rejected before D1 membership and data queries',async()=>{
 const db=mockDb();const r=await customerHistoryRoute(request(ACCOUNT_A,SITE_A,'scans','bad'),{DB:db,CUSTOMER_API_ENABLED:'true'});
 assert.equal(r.status,401);assert.equal(db.queries.length,0);
});
test('non-member receives not found without querying customer records',async()=>{
 const db=mockDb({member:null});const r=await customerHistoryRoute(request(ACCOUNT_B),{DB:db,CUSTOMER_API_ENABLED:'true'});
 assert.equal(r.status,404);assert.equal(db.queries.some(q=>q.sql.includes('FROM customer_scans')),false);
});
test('viewer can read only scoped scan history',async()=>{
 const db=mockDb({member:'viewer'});const r=await customerHistoryRoute(request(),{DB:db,CUSTOMER_API_ENABLED:'true'});
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{scans:[]});
 const q=db.queries.find(q=>q.sql.includes('FROM customer_scans'));
 assert.deepEqual(q.params,[ACCOUNT_A,SITE_A,30]);
});
test('customer report endpoint scopes reads to both account and site',async()=>{
 const db=mockDb();const r=await customerHistoryRoute(request(ACCOUNT_A,SITE_A,'reports'),{DB:db,CUSTOMER_API_ENABLED:'true'});
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{reports:[]});
 assert.deepEqual(db.queries.find(q=>q.sql.includes('FROM customer_reports')).params,[ACCOUNT_A,SITE_A,30]);
});
test('unknown site, non-GET method, and malformed route are blocked',async()=>{
 const db=mockDb({site:false});
 assert.equal((await customerHistoryRoute(request(),{DB:db,CUSTOMER_API_ENABLED:'true'})).status,404);
 assert.equal((await customerHistoryRoute(request(ACCOUNT_A,SITE_A,'scans',TOKEN,'POST'),{DB:db,CUSTOMER_API_ENABLED:'true'})).status,405);
 assert.equal(await customerHistoryRoute(new Request(`${ORIGIN}/api/customer/accounts/nope/sites/nope/scans`),{DB:db,CUSTOMER_API_ENABLED:'true'}),null);
});
