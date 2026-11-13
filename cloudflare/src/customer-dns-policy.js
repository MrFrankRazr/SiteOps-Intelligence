// SiteOps v0.7.2 Phase E. OFFLINE DNS-answer assessment; no network requests.
// This module is a preliminary gate, NOT proof that fetch() uses assessed addresses.
// Do not connect global fetch: safe network use also requires connection-time IP enforcement.
const IPV4 = /^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/;
export function isApprovedPublicIPv4(address) {
  if (typeof address !== 'string' || !IPV4.test(address)) return false;
  const n=address.split('.').map(Number);
  if (n.some(x=>x>255)) return false;
  const [a,b,c] = n;
  // Deliberately conservative: reject special-purpose, test, documentation, shared,
  // multicast and non-global address families, not only RFC1918 ranges.
  if (a===0||a===10||a===127||a>=224) return false;
  if (a===100 && b>=64 && b<=127) return false;
  if (a===169 && b===254) return false;
  if (a===172 && b>=16 && b<=31) return false;
  if (a===192 && (b===0 || b===168 || (b===88&&c===99))) return false;
  if (a===198 && ((b===18||b===19)||(b===51&&c===100))) return false;
  if (a===203 && b===0 && c===113) return false;
  if (a===192 && b===0 && c===2) return false;
  if (a===192 && b===0 && c===0) return false;
  if (a===255) return false;
  return true;
}
export function assessCustomerDnsAnswers(hostname, answers) {
  // Inputs must come from an independently authenticated resolver, never a caller.
  // DNS validation without connection-time pinning is vulnerable to rebinding/TOCTOU.
  if (typeof hostname!=='string'||hostname.length>253||!hostname.includes('.')||
      hostname.toLowerCase()!==hostname||hostname.endsWith('.')||
      !/^[a-z0-9.-]+$/.test(hostname) || hostname.includes('..'))
    throw new TypeError('Invalid DNS question');
  if (!Array.isArray(answers)||answers.length===0||answers.length>16)
    throw new TypeError('DNS answers unavailable or too numerous');
  const seen = new Set();
  for (const record of answers) {
    if (!record||typeof record!=='object'||Array.isArray(record)||
        record.name!==hostname || record.type!=='A' ||
        typeof record.address!=='string' || !isApprovedPublicIPv4(record.address)) {
      throw new TypeError('DNS answer not permitted');
    }
    seen.add(record.address);
  }
  return Object.freeze({hostname,approvedIPv4:Object.freeze([...seen]),requiresConnectionPinning:true});
}
