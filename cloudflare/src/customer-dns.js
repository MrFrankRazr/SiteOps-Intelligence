// Resolve ownership records via a fixed DNS-over-HTTPS endpoint, not a caller-supplied URL.
export async function resolveOwnershipTxt(name, fetchFn=fetch) {
  if (!/^_siteops-verify\.([a-z0-9-]+\.)+[a-z]{2,}$/i.test(name)) throw new Error('Invalid verification hostname');
  const url = new URL('https://cloudflare-dns.com/dns-query');
  url.searchParams.set('name',name);
  url.searchParams.set('type','TXT');
  const response = await fetchFn(url.href,{headers:{accept:'application/dns-json'},signal:AbortSignal.timeout(5000),redirect:'error'});
  if(!response.ok) throw new Error('DNS resolution unavailable');
  const data = await response.json();
  if(data.Status !== 0 || !Array.isArray(data.Answer)) return [];
  return data.Answer.filter(r => r.type === 16 && r.name?.replace(/\.$/,'').toLowerCase()===name.toLowerCase() && typeof r.data==='string').map(r=>r.data.replace(/^"|"$/g,''));
}
