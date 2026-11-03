import test from 'node:test';
import assert from 'node:assert/strict';
import {customerRoute} from '../src/customer.js';
const TOKEN='a'.repeat(64);
const ACCOUNT='11111111-1111-4111-8111-111111111111';
const ORIGIN='https://siteops-customer-staging.paddockcommand.workers.dev';
function db(){
 const state={writes:0};
 return {state,prepare(sql){return {
  bind(...args){return {
   async first(){if(sql.includes('FROM customer_access_tokens'))return {user_id:'owner'};if(sql.includes('FROM account_members'))return {role:'owner'};return null;},
   async run(){state.writes++;return {success:true};},
   async all(){return {results:[]};}
  }}
  }}
 };
}
function req(origin, site='same-origin'){
 return new Request(`${ORIGIN}/api/customer/accounts/${ACCOUNT}/sites`,{method:'POST',headers:{authorization:`Bearer ${TOKEN}`,'content-type':'application/json', ...(origin===null?{}:{origin}), 'sec-fetch-site':site},body:JSON.stringify({url:'https://example.com/'})});
}
test('valid bearer and exact same-origin browser POST registers pending site',async()=>{
 const d=db(); const r=await customerRoute(req(ORIGIN),{DB:d,CUSTOMER_API_ENABLED:'true',DASHBOARD_ORIGIN:ORIGIN});
 assert.equal(r.status,201);const body=await r.json();assert.equal(body.state,'pending');assert.equal(d.state.writes,1);
});
test('cross-origin browser POST rejected before mutation',async()=>{
 const d=db();const r=await customerRoute(req('https://attacker.example'),{DB:d,CUSTOMER_API_ENABLED:'true',DASHBOARD_ORIGIN:ORIGIN});
 assert.equal(r.status,403);assert.equal(d.state.writes,0);
});
test('cross-site metadata rejected even with forged trusted origin',async()=>{
 const d=db();const r=await customerRoute(req(ORIGIN,'cross-site'),{DB:d,CUSTOMER_API_ENABLED:'true',DASHBOARD_ORIGIN:ORIGIN});
 assert.equal(r.status,403);assert.equal(d.state.writes,0);
});
test('missing browser origin with same-origin metadata is rejected',async()=>{
 const d=db();const r=await customerRoute(req(null),{DB:d,CUSTOMER_API_ENABLED:'true',DASHBOARD_ORIGIN:ORIGIN});
 assert.equal(r.status,403);assert.equal(d.state.writes,0);
});
