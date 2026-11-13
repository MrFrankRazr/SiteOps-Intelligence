import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCustomerTarget,validateCustomerRedirect,CUSTOMER_MAX_REDIRECTS} from '../src/customer-target-policy.js';
const ROOT='https://siteops-test.paddockcommand.com/';
test('allows exact registered HTTPS domain root',()=>{
 assert.equal(validateCustomerTarget(ROOT,ROOT),ROOT);
});
test('blocks other domains, subdomains, ports and alternate schemes',()=>{
 for (const u of ['https://attacker.example.org/','https://sub.siteops-test.paddockcommand.com/','https://siteops-test.paddockcommand.com:8443/','http://siteops-test.paddockcommand.com/']) assert.throws(()=>validateCustomerTarget(ROOT,u),u);
});
test('rejects credentials, paths, query strings and fragments',()=>{
 for (const u of ['https://user:pass@siteops-test.paddockcommand.com/','https://siteops-test.paddockcommand.com/page','https://siteops-test.paddockcommand.com/?q=1','https://siteops-test.paddockcommand.com/#x']) assert.throws(()=>validateCustomerTarget(ROOT,u),u);
});
test('rejects IPv4/IPv6 and parser-normalized numeric hosts',()=>{
 for (const u of ['https://127.0.0.1/','https://[::1]/','https://2130706433/','https://0x7f000001/','https://0177.0.0.1/']) assert.throws(()=>validateCustomerTarget(u,u),u);
});
test('rejects internal, local and reserved names',()=>{
 for (const u of ['https://localhost/','https://host.internal/','https://foo.local/','https://metadata.google.internal/','https://foo.test/','https://foo.invalid/','https://foo.onion/']) assert.throws(()=>validateCustomerTarget(u,u),u);
});
test('rejects malformed values and control characters',()=>{
 for (const u of [null, {}, 'https://bad host.com/', 'https://example.com/\n', 'https://example.com/\t', 'https://example.com/\0']) assert.throws(()=>validateCustomerTarget(u,u));
});
test('same-origin relative redirects are permitted',()=>{
 assert.equal(validateCustomerRedirect(ROOT,ROOT,'/new',0),'https://siteops-test.paddockcommand.com/new');
 assert.equal(validateCustomerRedirect(ROOT,'https://siteops-test.paddockcommand.com/a','../b',1),'https://siteops-test.paddockcommand.com/b');
});
test('cross-origin, HTTPS downgrade, credential and port redirects rejected',()=>{
 for (const location of ['https://example.org/', 'http://siteops-test.paddockcommand.com/', 'https://other.siteops-test.paddockcommand.com/', 'https://user@siteops-test.paddockcommand.com/', 'https://siteops-test.paddockcommand.com:444/']) assert.throws(()=>validateCustomerRedirect(ROOT,ROOT,location,0),location);
});
test('redirect count is bounded',()=>{
 assert.equal(CUSTOMER_MAX_REDIRECTS,3);
 for (const n of [-1,3,4,1.5,'1']) assert.throws(()=>validateCustomerRedirect(ROOT,ROOT,'/next',n));
});
test('redirect query, fragment, and foreign current origin rejected',()=>{
 for (const location of ['/path?q=1','/path#fragment']) assert.throws(()=>validateCustomerRedirect(ROOT,ROOT,location,0));
 assert.throws(()=>validateCustomerRedirect(ROOT,'https://other.example.org/','/next',0));
});
