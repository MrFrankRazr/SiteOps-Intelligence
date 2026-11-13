import test from 'node:test';
import assert from 'node:assert/strict';
import {isApprovedPublicIPv4,assessCustomerDnsAnswers} from '../src/customer-dns-policy.js';
const host='sample.example.com';
const a=(address,name=host,type='A')=>({name,type,address});
test('accepts canonical global unicast IPv4 candidates',()=>{
  assert.equal(isApprovedPublicIPv4('8.8.8.8'),true);
  assert.equal(isApprovedPublicIPv4('1.1.1.1'),true);
});
test('rejects loopback/private/CGNAT/link-local',()=>{
  for(const ip of ['127.0.0.1','10.3.4.5','172.16.5.4','172.31.5.4','192.168.1.2','100.64.0.1','100.127.255.255','169.254.169.254'])assert.equal(isApprovedPublicIPv4(ip),false,ip);
});
test('rejects reserved and documentation networks',()=>{
  for(const ip of ['0.0.0.0','192.0.2.10','198.51.100.1','203.0.113.2','198.18.1.4','192.0.0.8','192.88.99.1','224.0.0.1','240.0.0.1','255.255.255.255'])assert.equal(isApprovedPublicIPv4(ip),false,ip);
});
test('rejects IPv4 parsing tricks, IPv6 and malformed values',()=>{
  for(const ip of ['0177.0.0.1','127.1','0x7f000001','::1','::ffff:127.0.0.1','8.8.8.999','8.08.8.8','8.8.8.8 '])assert.equal(isApprovedPublicIPv4(ip),false,ip);
});
test('accepts answers only for exact hostname',()=>{
  assert.throws(()=>assessCustomerDnsAnswers(host,[a('8.8.8.8','other.example.com')]),TypeError);
});
test('rejects any private address in otherwise public set',()=>{
  assert.throws(()=>assessCustomerDnsAnswers(host,[a('8.8.8.8'),a('10.0.0.2')]),TypeError);
});
test('rejects AAAA and IPv6 until network transport can enforce them',()=>{
  assert.throws(()=>assessCustomerDnsAnswers(host,[a('2001:4860:4860::8888',host,'AAAA')]),TypeError);
});
test('rejects CNAME or unknown record types',()=>{
  assert.throws(()=>assessCustomerDnsAnswers(host,[a('other.example.com',host,'CNAME')]),TypeError);
});
test('rejects empty and excessive answer sets',()=>{
  assert.throws(()=>assessCustomerDnsAnswers(host,[]),TypeError);
  assert.throws(()=>assessCustomerDnsAnswers(host,Array(17).fill(a('8.8.8.8'))),TypeError);
});
test('rejects malformed questions',()=>{
  for(const h of ['LOCALHOST','a','a..example.com','a.example.com.'])assert.throws(()=>assessCustomerDnsAnswers(h,[a('8.8.8.8',h)]),TypeError);
});
test('deduplicates only approved answers',()=>{
  const result=assessCustomerDnsAnswers(host,[a('8.8.8.8'),a('8.8.8.8'),a('1.1.1.1')]);
  assert.deepEqual(result.approvedIPv4,['8.8.8.8','1.1.1.1']);
  assert.equal(result.requiresConnectionPinning,true);
  assert.equal(Object.isFrozen(result),true);
});
test('rejects untrusted or malformed DNS record shapes',()=>{
  for(const record of [null, '8.8.8.8',{name:host,type:'A',address:42},{}])assert.throws(()=>assessCustomerDnsAnswers(host,[record]),TypeError);
});
