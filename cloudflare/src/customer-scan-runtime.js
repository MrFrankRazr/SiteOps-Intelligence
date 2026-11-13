// SiteOps v0.7.2 Phase C: offline response limits and batch failure isolation.
// Does NOT perform fetch(), resolve DNS, persist results or schedule scans.
// Never connect this to arbitrary customer URLs without request-time SSRF controls.
export const CUSTOMER_RESPONSE_MAX_BYTES = 131072;
export const CUSTOMER_BATCH_MAX_JOBS = 10;
export const CUSTOMER_BATCH_CONCURRENCY = 2;

export class CustomerScanLimitError extends Error {
  constructor(message) { super(message); this.name = 'CustomerScanLimitError'; }
}
export async function readBoundedCustomerResponse(response, options = {}) {
  const maxBytes = options.maxBytes ?? CUSTOMER_RESPONSE_MAX_BYTES;
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > CUSTOMER_RESPONSE_MAX_BYTES)
    throw new TypeError('Invalid response byte limit');
  const type = response?.headers?.get?.('content-type')?.toLowerCase() ?? '';
  if (!/^text\/html(?:\s*;|$)/.test(type))
    throw new CustomerScanLimitError('Only HTML responses are permitted');
  const rawLength = response.headers.get('content-length');
  if (rawLength != null && (!/^\d+$/.test(rawLength.trim()) || Number(rawLength) > maxBytes))
    throw new CustomerScanLimitError('Response length exceeds limit or is invalid');
  const reader = response.body?.getReader?.();
  if (!reader) throw new CustomerScanLimitError('Readable response body required');
  const chunks = [];
  let bytes = 0;
  let completed = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) { completed = true; break; }
      if (!(value instanceof Uint8Array)) throw new CustomerScanLimitError('Non-byte response chunk');
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new CustomerScanLimitError('Response exceeds byte limit');
      chunks.push(value);
    }
    const buffer = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk,offset); offset += chunk.byteLength; }
    return { bytes, html: new TextDecoder('utf-8', { fatal: false }).decode(buffer) };
  } finally {
    if (!completed) { try { await reader.cancel(); } catch { /* cancellation best effort */ } }
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}
// Pure orchestrator: caller supplies approved, already-safe jobs.
// Job errors become bounded, non-sensitive records rather than terminating other jobs.
// This does not provide a network timeout or process isolation.
export async function runIsolatedCustomerBatch(jobs, runJob, opts = {}) {
  if (!Array.isArray(jobs) || jobs.length > CUSTOMER_BATCH_MAX_JOBS)
    throw new TypeError('Too many jobs');
  if (typeof runJob !== 'function') throw new TypeError('runJob must be a function');
  const concurrency = opts.concurrency ?? CUSTOMER_BATCH_CONCURRENCY;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > CUSTOMER_BATCH_CONCURRENCY)
    throw new TypeError('Invalid concurrency');
  const results = Array(jobs.length);
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const i = cursor++;
      try {
        results[i] = { ok: true, value: await runJob(jobs[i], i) };
      } catch {
        // Never surface exception messages: they may contain URL credentials or internals.
        results[i] = { ok: false, error: 'Customer scan job failed' };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency,jobs.length) }, worker));
  return results;
}
