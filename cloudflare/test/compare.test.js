import test from 'node:test';
import assert from 'node:assert/strict';
import {compare} from '../src/index.js';
test('initial scan establishes baseline',()=>assert.deepEqual(compare(null,{status:200}),{changed:0,critical:0,findings:[],baseline:true}));
test('unchanged scan returns no differences',()=>assert.equal(compare({status:200,title:'A'}, {status:200,title:'A'}).changed,0));
test('new HTTP error is critical',()=>{const c=compare({status:200},{status:404});assert.equal(c.changed,1);assert.equal(c.critical,1);});
test('title change requires review',()=>{const c=compare({status:200,title:'A'}, {status:200,title:'B'});assert.equal(c.changed,1);assert.equal(c.critical,0);});
