import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateCustomerRequest, CustomerScanTimeoutError} from '../src/customer-scan-transport.js';
const site='https://www.example.org/';
const ok=(html='OK')=>new Response(html,{headers:{'content-type':'text/html'}});
test('requires explicitly injected transport',async()=>{
 await assert.rejects(simulateCustomerRequest(site),TypeError);
});
test('calls transport with manual redirects and abort signal',async()=>{
 let options;
 const result=await simulateCustomerRequest(site,{transport:async (_url,opts)=>{options=opts;return ok();}});
 assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');assert.equal(options.headers.accept,'text/html');
 assert.equal(typeof options.signal.aborted,'boolean');assert.equal(result.html,'OK');assert.equal(result.status,200);
});
test('rejects non-HTTPS initial target before transport',async()=>{
 let calls=0;
 await assert.rejects(simulateCustomerRequest('http://www.example.org/',{transport:async()=>{calls++;return ok();}}),TypeError);
 assert.equal(calls,0);
});
test('follows same-origin redirect with validation',async()=>{
 const seen=[];
 const result=await simulateCustomerRequest(site,{transport:async u=>{seen.push(u);return seen.length===1?new Response(null,{status:301,headers:{location:'/news'}}):ok('News');}});
 assert.deepEqual(seen,[site,'https://www.example.org/news']);assert.equal(result.redirects,1);
});
test('rejects cross-origin redirect without second request',async()=>{
 let calls=0;
 await assert.rejects(simulateCustomerRequest(site,{transport:async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://attacker.com/'}});}}),TypeError);
 assert.equal(calls,1);
});
test('rejects HTTPS downgrade redirect',async()=>{
 await assert.rejects(simulateCustomerRequest(site,{transport:async()=>new Response(null,{status:302,headers:{location:'http://www.example.org/'}})}),TypeError);
});
test('limits redirect chain to three',async()=>{
 let calls=0;
 await assert.rejects(simulateCustomerRequest(site,{transport:async()=>{calls++;return new Response(null,{status:301,headers:{location:'/next'}});}}),RangeError);
 assert.equal(calls,4);
});
test('rejects redirects lacking a location',async()=>{
 await assert.rejects(simulateCustomerRequest(site,{transport:async()=>new Response(null,{status:302})}),TypeError);
});
test('times out even if the injected transport does not honor abort',async()=>{
 await assert.rejects(simulateCustomerRequest(site,{timeoutMs:20,transport:async()=>new Promise(()=>{})}),CustomerScanTimeoutError);
});
test('rejects oversized HTML from transport',async()=>{
 await assert.rejects(simulateCustomerRequest(site,{transport:async()=>ok('x'.repeat(131073))}),/limit/);
});
test('rejects invalid timeout configuration',async()=>{
 await assert.rejects(simulateCustomerRequest(site,{transport:async()=>ok(),timeoutMs:0}),TypeError);
 await assert.rejects(simulateCustomerRequest(site,{transport:async()=>ok(),timeoutMs:9000}),TypeError);
});
