import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeUrl,compare,pinnedLookup} from '../scanner/engine.js';
test('rejects credentials, unexpected ports and non-web protocols',()=>{
  for(const u of ['file:///etc/passwd','http://localhost','http://user:pass@example.com','https://example.com:8443/','http://127.0.0.1']) assert.throws(()=>normalizeUrl(u));
});
test('normalizes fragments away',()=> assert.equal(normalizeUrl('https://example.com/a#frag').href,'https://example.com/a'));
test('comparison identifies errors and metadata change',()=>{
  const before={requestedUrl:'https://example.com',finalUrl:'https://example.com/',status:200,title:'Old',canonical:null};
  const after={...before,status:404,title:'New',checkedAt:'2026-10-13T00:00:00Z'};
  const diff=compare(before,after);
  assert.equal(diff.summary.changed,2);assert.equal(diff.summary.critical,1);
});
test('unchanged results create no findings',()=>{
  const result={requestedUrl:'https://example.com',finalUrl:'https://example.com/',status:200,title:'Page',canonical:null};
  assert.equal(compare(result,result).summary.changed,0);
});

test('pinned lookup returns a validated single address', async()=>{
  const lookup=pinnedLookup({address:'8.8.8.8',family:4});
  await new Promise((resolve,reject)=> lookup('example.com', {all:false}, (error, ip, family)=>{
    try { assert.ifError(error); assert.equal(ip,'8.8.8.8'); assert.equal(family,4); resolve(); } catch(e) { reject(e); }
  }));
});
test('pinned lookup handles all-address DNS mode used by newer Node versions', async()=>{
  const lookup=pinnedLookup({address:'8.8.8.8',family:4});
  await new Promise((resolve,reject)=> lookup('example.com',{all:true},(error,addresses)=>{
    try { assert.ifError(error); assert.deepEqual(addresses,[{address:'8.8.8.8',family:4}]); resolve(); } catch(e) { reject(e); }
  }));
});
