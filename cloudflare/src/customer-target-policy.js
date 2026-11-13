// SiteOps v0.7.2 Phase B: conservative customer destination policy.
// Pure validation only: NO fetches, DNS lookups, or customer scan execution.
// DNS rebinding and request-time IP checks are NOT solved by this module.
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.test', '.invalid', '.example', '.home', '.lan', '.onion'];
const FORBIDDEN_HOSTS = new Set(['localhost', 'metadata.google.internal']);
const MAX_REDIRECTS = 3;

function safeHostname(hostname) {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (!h || h.length > 253 || FORBIDDEN_HOSTS.has(h)) return false;
  if (BLOCKED_SUFFIXES.some(s => h.endsWith(s))) return false;
  // Reject all IPv4/IPv6 literals, including URL-parser-normalized alternative IPv4 forms.
  if (h.includes(':') || h.startsWith('[') || /^\d+(?:\.\d+){3}$/.test(h)) return false;
  // DNS labels must be valid and host must end in an alphabetic (or punycode) TLD.
  const labels = h.split('.');
  if (labels.length < 2 || labels.some(l => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l))) return false;
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(labels.at(-1))) return false;
  return true;
}
function parseHttps(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\u007f]/.test(value)) throw new TypeError('Invalid target URL');
  let url;
  try { url = new URL(value); } catch { throw new TypeError('Invalid target URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || !safeHostname(url.hostname))
    throw new TypeError('Target must use a public HTTPS hostname without credentials, ports, or fragments');
  return url;
}

export function validateCustomerTarget(registeredUrl, requestedUrl) {
  const registered = parseHttps(registeredUrl);
  if (registered.pathname !== '/' || registered.search || registered.href !== registered.origin + '/')
    throw new TypeError('Registered website must be an HTTPS domain root');
  const requested = parseHttps(requestedUrl);
  if (requested.origin !== registered.origin || requested.pathname !== '/' || requested.search)
    throw new TypeError('Customer scan target must match the exact registered root');
  return requested.href;
}

export function validateCustomerRedirect(registeredUrl, currentUrl, location, redirectCount) {
  if (!Number.isInteger(redirectCount) || redirectCount < 0 || redirectCount >= MAX_REDIRECTS)
    throw new RangeError('Customer redirect limit reached');
  const registered = parseHttps(registeredUrl);
  if (registered.pathname !== '/' || registered.search || registered.href !== registered.origin + '/')
    throw new TypeError('Registered website must be an HTTPS domain root');
  const current = parseHttps(currentUrl);
  if (current.origin !== registered.origin) throw new TypeError('Current URL is outside the registered origin');
  if (typeof location !== 'string' || location.length > 2048 || /[\u0000-\u001f\u007f]/.test(location))
    throw new TypeError('Invalid redirect location');
  let next;
  try { next = new URL(location, current); } catch { throw new TypeError('Invalid redirect location'); }
  const safe = parseHttps(next.href);
  if (safe.origin !== registered.origin) throw new TypeError('Cross-origin redirects are not allowed');
  if (safe.search) throw new TypeError('Redirect query strings are not allowed');
  return safe.href;
}

export const CUSTOMER_MAX_REDIRECTS = MAX_REDIRECTS;
