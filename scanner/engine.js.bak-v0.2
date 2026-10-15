import {promises as dns} from 'node:dns';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';

const MAX_BYTES = 512_000;
const TIMEOUT_MS = 9000;
const MAX_REDIRECTS = 4;
function rejectPrivateIp(ip) {
  if (net.isIP(ip) === 4) {
    const [a,b,c] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a===169 && b===254) || (a===172 && b>=16 && b<=31) || (a===192 && b===168) || (a===100 && b>=64 && b<=127) || (a===192 && b===0 && c===0) || (a===192 && b===0 && c===2) || (a===198 && b===18) || (a===198 && b===19) || (a===198 && b===51 && c===100) || (a===203 && b===0 && c===113) || (a===192 && b===88 && c===99) || a===255;
  }
  const s = ip.toLowerCase();
  if (s.startsWith('::ffff:')) return rejectPrivateIp(s.slice(7));
  return s === '::' || s === '::1' || s.startsWith('fc') || s.startsWith('fd') || /^fe[89ab]/.test(s.slice(0,4)) || s.startsWith('ff') || s.startsWith('2001:db8:') || s.startsWith('2001:10:');
}
export function normalizeUrl(raw) {
  const u = new URL(raw);
  if (!['https:','http:'].includes(u.protocol) || u.username || u.password || u.port || !u.hostname.includes('.') || net.isIP(u.hostname) || u.hostname.endsWith('.local')) throw new Error('Only public HTTP(S) URLs on default ports are supported');
  u.hash=''; return u;
}
export async function resolvePublic(hostname) {
  if (net.isIP(hostname)) throw new Error('IP literal hosts are not allowed');
  const records = await dns.lookup(hostname,{all:true,verbatim:true});
  if (!records.length || records.some(r=>rejectPrivateIp(r.address))) throw new Error('Non-public or unresolved hostname');
  return records[0];
}
export function pinnedLookup(address) {
  if (!address || !net.isIP(address.address) || ![4,6].includes(address.family)) throw new Error('Invalid pinned DNS address');
  return (_hostname, options, callback) => {
    if (options?.all) callback(null, [{address:address.address, family:address.family}]);
    else callback(null, address.address, address.family);
  };
}
function fetchOnce(u, address) {
  return new Promise((resolve,reject)=>{
    const mod=u.protocol==='https:'?https:http;
    const req=mod.get(u,{
      lookup:pinnedLookup(address),
      headers:{'user-agent':'SiteOpsIntelligence-Prototype/0.2 (+manual authorized scanning)','accept':'text/html,application/xhtml+xml;q=0.9,*/*;q=0.2'},
      timeout:TIMEOUT_MS, agent:false, maxHeaderSize:16_384
    },res=>{
      const chunks=[];let total=0;
      res.on('data',chunk=>{total+=chunk.length;if(total>MAX_BYTES){req.destroy(new Error('Response exceeds scan size limit'));return;}chunks.push(chunk);});
      res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,html:Buffer.concat(chunks).toString('utf8')}));
      res.on('error',reject);
    });
    req.on('timeout',()=>req.destroy(new Error('Request timeout')));
    req.on('error',reject);
  });
}
function extract(html) {
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]?.replace(/\s+/g,' ').trim() ?? null;
  const tags = html.match(/<link\s+[^>]*>/gi) ?? [];
  const canonical = tags.map(tag=>({rel:tag.match(/\brel\s*=\s*['"]([^'"]+)['"]/i)?.[1], href:tag.match(/\bhref\s*=\s*['"]([^'"]+)['"]/i)?.[1]})).find(t=>t.rel?.toLowerCase().split(/\s+/).includes('canonical'))?.href ?? null;
  return {title,canonical};
}
export async function scan(raw) {
  let u=normalizeUrl(raw); const chain=[];
  for(let i=0;i<=MAX_REDIRECTS;i++){
    const addr=await resolvePublic(u.hostname);
    const res=await fetchOnce(u,addr);
    chain.push({url:u.href,status:res.status});
    if ([301,302,303,307,308].includes(res.status) && res.headers.location) {
      if(i===MAX_REDIRECTS) throw new Error('Too many redirects');
      u=normalizeUrl(new URL(res.headers.location,u).href); continue;
    }
    const meta = (String(res.headers['content-type']??'').includes('html')) ? extract(res.html):{title:null,canonical:null};
    return {requestedUrl:raw,finalUrl:u.href,status:res.status,redirects:chain,title:meta.title,canonical:meta.canonical,checkedAt:new Date().toISOString()};
  }
  throw new Error('Redirect limit');
}
export function compare(previous,current){
  const findings=[];
  const add=(field,before,after,severity)=>findings.push({field,before,after,severity});
  if(previous.status!==current.status)add('HTTP status',previous.status,current.status,current.status>=400?'critical':'review');
  if(previous.finalUrl!==current.finalUrl)add('Final URL',previous.finalUrl,current.finalUrl,'review');
  if(previous.title!==current.title)add('Page title',previous.title,current.title,'review');
  if(previous.canonical!==current.canonical)add('Canonical URL',previous.canonical,current.canonical,'review');
  return {checkedAt:current.checkedAt,website:current.requestedUrl,findings,summary:{changed:findings.length,critical:findings.filter(f=>f.severity==='critical').length}};
}
