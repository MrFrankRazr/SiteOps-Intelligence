import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeUrl,compare} from '../scanner/engine.js';
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
