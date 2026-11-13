// v0.7.2 Phase D: injected-transport test harness, NOT safe for arbitrary web fetch.
// Never pass global fetch until DNS resolution, IP pinning and request-time SSRF protections exist.
import { validateCustomerTarget, validateCustomerRedirect, CUSTOMER_MAX_REDIRECTS } from './customer-target-policy.js';
import { readBoundedCustomerResponse } from './customer-scan-runtime.js';

export const CUSTOMER_SCAN_TIMEOUT_MS = 8000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export class CustomerScanTimeoutError extends Error {
  constructor() { super('Customer scan timed out'); this.name = 'CustomerScanTimeoutError'; }
}

// Requires an explicitly injected test transport. No fallback to global fetch.
// This validates URL policy at each redirect but does NOT independently verify DNS/IP.
// Each transport is responsible for honoring AbortSignal and preventing unsafe connections.
export async function simulateCustomerRequest(registeredUrl, { transport, timeoutMs = CUSTOMER_SCAN_TIMEOUT_MS } = {}) {
  if (typeof transport !== 'function') throw new TypeError('An injected test transport is required');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > CUSTOMER_SCAN_TIMEOUT_MS)
    throw new TypeError('Invalid timeout');
  let url = validateCustomerTarget(registeredUrl, registeredUrl);
  const controller = new AbortController();
  let timeoutId;
  // A Promise.race cap ensures an uncooperative injected transport cannot hold up this function.
  const deadline = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {controller.abort(); reject(new CustomerScanTimeoutError());}, timeoutMs);
  });
  const work = (async () => {
    const redirects = [];
    for (let count = 0; count <= CUSTOMER_MAX_REDIRECTS; count++) {
      if (controller.signal.aborted) throw new CustomerScanTimeoutError();
      const response = await transport(url, {
        method: 'GET', redirect: 'manual', signal: controller.signal,
        headers: { accept: 'text/html' }
      });
      if (!response || !Number.isInteger(response.status)) throw new TypeError('Invalid transport response');
      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers?.get?.('location');
        if (location == null) throw new TypeError('Redirect without location');
        const next = validateCustomerRedirect(registeredUrl, url, location, count);
        redirects.push({ status: response.status }); // no unnecessary URLs in results
        try { await response.body?.cancel?.(); } catch { /* best effort */ }
        url = next;
        continue;
      }
      const body = await readBoundedCustomerResponse(response);
      return { status: response.status, finalUrl: url, redirects: redirects.length, ...body };
    }
    throw new RangeError('Redirect limit reached');
  })();
  try { return await Promise.race([work, deadline]); }
  finally { clearTimeout(timeoutId); controller.abort(); }
}
