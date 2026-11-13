import test from 'node:test';
import assert from 'node:assert/strict';
import {customerMonitoringRoute} from '../src/customer-monitoring.js';
const ORIGIN='https://siteops-customer-staging.paddockcommand.workers.dev';
const A='11111111-1111-4111-8111-111111111111';
const S='33333333-3333-4333-8333-333333333333';
const path=`${ORIGIN}/api/customer/accounts/${A}/sites/${S}/monitoring`;
const token='a'.repeat(64);
function makeReq({enabled=true,origin=ORIGIN,site='same-origin',tokenValue=token,method='POST',body}={}){
  return new Request(path,{method,headers:{authorization:'Bearer '+tokenValue,'content-type':'application/json',...(origin===null?{}:{origin}),'sec-fetch-site':site},body:method==='POST'?(body??JSON.stringify({enabled})):undefined});
}
function db({role='owner',verified=true,hasSite=true,changes=1}={}){
 const state={writes:0,params:null};
 return {state,prepare(sql){return {bind(...params){return {
  async first(){if(sql.includes('FROM customer_access_tokens'))return {user_id:'u1'};if(sql.includes('FROM account_members'))return role?{role}:null;if(sql.includes('FROM monitored_sites'))return hasSite?{verification_state:verified?'verified':'pending',monitoring_enabled:0}:null;return null;},
  async run(){state.writes++;state.params=params;return {meta:{changes}};}
 };}};}};
}
const env=db=>({DB:db,CUSTOMER_API_ENABLED:'true',CUSTOMER_MONITORING_CONTROLS_ENABLED:'true',DASHBOARD_ORIGIN:ORIGIN});
test('feature flag is off by default without DB queries',async()=>{const r=await customerMonitoringRoute(makeReq(),{CUSTOMER_API_ENABLED:'true',DB:{prepare(){throw Error('DB touched')}}});assert.equal(r.status,404);});
test('bad token is rejected without data access',async()=>{const d=db();const r=await customerMonitoringRoute(makeReq({tokenValue:'invalid'}),env(d));assert.equal(r.status,401);assert.equal(d.state.writes,0);});
test('cross-origin and cross-site requests rejected without writes',async()=>{const d=db();for(const req of [makeReq({origin:'https://evil.example'}),makeReq({site:'cross-site'}),makeReq({origin:null})]){assert.equal((await customerMonitoringRoute(req,env(d))).status,403);}assert.equal(d.state.writes,0);});
test('viewer and non-member cannot modify',async()=>{for(const role of ['viewer',null]){const d=db({role});assert.equal((await customerMonitoringRoute(makeReq(),env(d))).status,404);assert.equal(d.state.writes,0);}});
test('unknown site returns 404',async()=>{const d=db({hasSite:false});assert.equal((await customerMonitoringRoute(makeReq(),env(d))).status,404);assert.equal(d.state.writes,0);});
test('pending site cannot enable monitoring',async()=>{const d=db({verified:false});assert.equal((await customerMonitoringRoute(makeReq(),env(d))).status,409);assert.equal(d.state.writes,0);});
test('owner can enable verified website only with SQL account/site gate',async()=>{const d=db();const r=await customerMonitoringRoute(makeReq(),env(d));assert.equal(r.status,200);assert.deepEqual(await r.json(),{siteId:S,monitoringEnabled:true,scheduledScanningActive:false});assert.equal(d.state.writes,1);assert.deepEqual(d.state.params,[1,A,S,1]);});
test('admin can disable pending site',async()=>{const d=db({role:'admin',verified:false});const r=await customerMonitoringRoute(makeReq({enabled:false}),env(d));assert.equal(r.status,200);assert.deepEqual(d.state.params,[0,A,S,0]);});
test('invalid payload rejected, no writes',async()=>{const d=db();for(const body of ['{}','{"enabled":"true"}','{"enabled":true,"extra":1}','invalid'])assert.equal((await customerMonitoringRoute(makeReq({body}),env(d))).status,400);assert.equal(d.state.writes,0);});
test('unsupported method rejected',async()=>{const d=db();assert.equal((await customerMonitoringRoute(makeReq({method:'GET'}),env(d))).status,405);});
