import test from 'node:test';
import assert from 'node:assert/strict';
import {customerPage,customerPageResponse} from '../src/customer-page.js';
test('customer page is disabled by default',()=>{assert.equal(customerPageResponse({}).status,404);assert.equal(customerPageResponse({CUSTOMER_API_ENABLED:'false'}).status,404)});
test('customer page enabled only for pilot staging flag',()=>{const r=customerPageResponse({CUSTOMER_API_ENABLED:'true'});assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy'),/connect-src 'self'/);assert.match(r.headers.get('cache-control'),/no-store/)});
test('customer page requires token and renders API data as text',()=>{const html=customerPage();assert.match(html,/type="password"/);assert.match(html,/textContent=s\.url/);assert.match(html,/credentials:'omit'/);assert.doesNotMatch(html,/localStorage|sessionStorage|document\.cookie/);assert.match(html,/monitoring stays off/i)});
