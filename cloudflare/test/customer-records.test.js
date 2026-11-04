import test from 'node:test';
import assert from 'node:assert/strict';
import {storeCustomerScanReport,listCustomerScans,listCustomerReports} from '../src/customer-records.js';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const S='33333333-3333-4333-8333-333333333333';
const scan={requestedUrl:'https://example.com/',status:200,checkedAt:'2026-11-03T20:00:00.000Z',title:'Example',finalUrl:'https://example.com/',canonical:null};
const comparison={changed:0,critical:0,findings:[],baseline:true};
function fakeDB(site={url:scan.requestedUrl}){
 const calls=[];const db={calls,prepare(sql){return {bind(...args){calls.push({sql,args});return {
  async first(){return site;},async all(){return {results:[]}},async run(){return {meta:{changes:1}}}
 }}}},async batch(stmts){assert.equal(stmts.length,2);return [{meta:{changes:1}},{meta:{changes:1}}]}};return db;
}
test('rejects invalid scope and invalid scan input',async()=>{
 const db=fakeDB();
 await assert.rejects(storeCustomerScanReport(db,{accountId:'bad',siteId:S,scan,comparison}),TypeError);
 await assert.rejects(storeCustomerScanReport(db,{accountId:A,siteId:S,scan:{...scan,status:'200'},comparison}),TypeError);
 assert.equal(db.calls.length,0);
});
test('rejects an unverified or mismatched site before persistence',async()=>{
 await assert.rejects(storeCustomerScanReport(fakeDB(null),{accountId:A,siteId:S,scan,comparison}),/Verified site/);
 await assert.rejects(storeCustomerScanReport(fakeDB({url:'https://other.example/'}),{accountId:A,siteId:S,scan,comparison}),/Verified site/);
});
test('store uses account and site in precheck and both guarded insert statements',async()=>{
 const db=fakeDB();const result=await storeCustomerScanReport(db,{accountId:A,siteId:S,scan,comparison});
 assert.match(result.scanId,/^[0-9a-f-]{36}$/);assert.equal(result.report.scanId,result.scanId);
 assert.deepEqual(db.calls[0].args,[A,S]);
 assert.match(db.calls[1].sql,/verification_state='verified'/);
 assert.deepEqual(db.calls[1].args.slice(-3),[A,S,scan.requestedUrl]);
 assert.deepEqual(db.calls[2].args.slice(-3),[A,S,result.scanId]);
});
test('read operations bind both account and site; no wildcard reads',async()=>{
 const db=fakeDB();await listCustomerScans(db,{accountId:A,siteId:S});await listCustomerReports(db,{accountId:A,siteId:S,limit:5});
 assert.deepEqual(db.calls[0].args,[A,S,30]);assert.deepEqual(db.calls[1].args,[A,S,5]);
 assert.match(db.calls[0].sql,/WHERE account_id=\? AND site_id=\?/);
 assert.match(db.calls[1].sql,/WHERE account_id=\? AND site_id=\?/);
 await assert.rejects(listCustomerScans(db,{accountId:B,siteId:S,limit:101}),RangeError);
});
test('no monitoring side effects: storage module has no scheduler or API',async()=>{
 const mod=await import('../src/customer-records.js');
 assert.deepEqual(Object.keys(mod).sort(),['listCustomerReports','listCustomerScans','storeCustomerScanReport']);
});
