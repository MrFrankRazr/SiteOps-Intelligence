import test from 'node:test';
import assert from 'node:assert/strict';
import {readBoundedCustomerResponse,runIsolatedCustomerBatch,CUSTOMER_RESPONSE_MAX_BYTES,CustomerScanLimitError} from '../src/customer-scan-runtime.js';
const response = (data, type='text/html', length) => new Response(data,{headers:{'content-type':type,...(length===undefined?{}:{'content-length':length})}});
test('reads ordinary HTML with bounded length', async () => {
  const r=await readBoundedCustomerResponse(response('<title>OK</title>'));
  assert.equal(r.html,'<title>OK</title>');
  assert.equal(r.bytes,17);
});
test('rejects oversized declared length', async () => {
  await assert.rejects(readBoundedCustomerResponse(response('ok','text/html',CUSTOMER_RESPONSE_MAX_BYTES+1)),CustomerScanLimitError);
});
test('rejects invalid declared length', async () => {
  await assert.rejects(readBoundedCustomerResponse(response('ok','text/html','not-a-number')),CustomerScanLimitError);
});
test('rejects unexpected content types', async () => {
  await assert.rejects(readBoundedCustomerResponse(response('{}','application/json')),CustomerScanLimitError);
});
test('rejects oversized streamed body regardless of header', async () => {
  await assert.rejects(readBoundedCustomerResponse(response('x'.repeat(40)),{maxBytes:16}),CustomerScanLimitError);
});
test('rejects invalid override limits', async () => {
  await assert.rejects(readBoundedCustomerResponse(response('ok'),{maxBytes:0}),TypeError);
  await assert.rejects(readBoundedCustomerResponse(response('ok'),{maxBytes:CUSTOMER_RESPONSE_MAX_BYTES+1}),TypeError);
});
test('requires an actual readable body', async () => {
  await assert.rejects(readBoundedCustomerResponse({headers:new Headers({'content-type':'text/html'})}),CustomerScanLimitError);
});
test('isolates failed jobs and preserves result ordering', async () => {
  const result=await runIsolatedCustomerBatch([1,2,3],async n=>{if(n===2)throw Error('secret internal detail');return n*5;});
  assert.deepEqual(result,[{ok:true,value:5},{ok:false,error:'Customer scan job failed'},{ok:true,value:15}]);
});
test('caps batch size and concurrency', async () => {
  await assert.rejects(runIsolatedCustomerBatch(Array(11).fill(1),async()=>1),TypeError);
  await assert.rejects(runIsolatedCustomerBatch([1],async()=>1,{concurrency:3}),TypeError);
});
test('does not start more than two jobs simultaneously', async () => {
  let active=0,max=0;
  const r=await runIsolatedCustomerBatch([1,2,3,4,5],async n=>{
    active++;max=Math.max(max,active);
    await new Promise(resolve=>setTimeout(resolve,1));
    active--;return n;
  });
  assert.equal(max,2);
  assert.deepEqual(r.map(x=>x.value),[1,2,3,4,5]);
});
