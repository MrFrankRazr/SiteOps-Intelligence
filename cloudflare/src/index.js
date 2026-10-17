import {createScanAndReport, scheduledScan, reportHtml} from './reports.js';
import {loginPage, dashboardPage} from './dashboard.js';
const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers: {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const MAX_BYTES = 256000;
export function compare(previous, current) {
  if (!previous) return {changed:0, critical:0, findings:[], baseline:true};
  const findings=[];
  for (const [field, label] of [['status','HTTP status'],['finalUrl','Final URL'],['title','Page title'],['canonical','Canonical URL']]) {
    if (previous[field] !== current[field]) findings.push({field:label, before:previous[field]??null, after:current[field]??null, severity: field==='status' && current.status>=400 ? 'critical':'review'});
  }
  return {changed:findings.length,critical:findings.filter(x=>x.severity==='critical').length,findings,baseline:false};
}
function allowedTarget(raw, env) {
  let u;
  try {u = new URL(raw);} catch {throw new Error('Invalid URL');}
  const target = new URL(env.TEST_TARGET);
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hostname !== target.hostname || !u.pathname.startsWith(target.pathname)) throw new Error('Target not allowed');
  u.hash='';
  return u;
}
async function scan(raw, env) {
  let u = allowedTarget(raw, env);
  const redirects=[];
  for (let i=0;i<=3;i++) {
    const response = await fetch(u.href, {method:'GET',redirect:'manual',signal:AbortSignal.timeout(8000),headers:{'user-agent':'SiteOpsIntelligence-TestScanner/0.3','accept':'text/html'}});
    redirects.push({url:u.href,status:response.status});
    if ([301,302,303,307,308].includes(response.status) && response.headers.has('location')) {
      if (i===3) throw new Error('Redirect limit exceeded');
      u=allowedTarget(new URL(response.headers.get('location'),u).href,env);
      continue;
    }
    if (Number(response.headers.get('content-length')||0)>MAX_BYTES) throw new Error('Response too large');
    const reader=response.body?.getReader();
    const parts=[];let bytes=0;
    if(reader){while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>MAX_BYTES){await reader.cancel();throw new Error('Response too large');}parts.push(value);}}
    const body=new Uint8Array(bytes);let offset=0;for(const part of parts){body.set(part,offset);offset+=part.length;}
    const html = (response.headers.get('content-type')||'').toLowerCase().includes('html')?new TextDecoder().decode(body):'';
    const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]?.replace(/\s+/g,' ').trim()??null;
    const tags = html.match(/<link\s+[^>]*>/gi)||[];
    const canonical = tags.map(t=>({rel:t.match(/\brel\s*=\s*['"]([^'"]+)['"]/i)?.[1],href:t.match(/\bhref\s*=\s*['"]([^'"]+)['"]/i)?.[1]})).find(t=>t.rel?.toLowerCase().split(/\s+/).includes('canonical'))?.href??null;
    return {requestedUrl:raw,finalUrl:u.href,status:response.status,title,canonical,redirects,checkedAt:new Date().toISOString()};
  }
  throw new Error('Unexpected redirect state');
}
export default {
  async scheduled(controller,env,ctx) {
    ctx.waitUntil(scheduledScan(env,scan,compare));
  },
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname==='/health' && request.method==='GET') return json({ok:true,release:'0.5.0'});
    const html=(markup,status=200,extra={})=>new Response(markup,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-frame-options':'DENY','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",...extra}});
    if(!env.SCAN_API_KEY || !env.DB || !env.TEST_TARGET) return json({error:'Backend not configured'},503);
    const cookie=request.headers.get('cookie')||'';
    const match=cookie.match(/(?:^|;\s*)siteops_session=([^;]+)/);
    const session=match?await validSession(match[1],env.SCAN_API_KEY):false;
    const bearer=request.headers.get('authorization')===`Bearer ${env.SCAN_API_KEY}`;
    const authenticated=session||bearer;
    const origin=request.headers.get('origin');
    const fetchSite=request.headers.get('sec-fetch-site');
    const isNullOrigin=origin==='null';
    // Cloudflare may expose a different internal request URL than the browser-facing route.
    // Validate browser submissions against an explicitly configured, trusted public origin.
    const trustedOrigin = env.DASHBOARD_ORIGIN || url.origin;
    if(request.method==='POST') {
      if(fetchSite==='cross-site' || fetchSite==='none') return json({error:'Invalid origin'},403);
      if(isNullOrigin) {
        // Null origins are only permitted for a browser-initiated same-origin login
        // that proves it came from our rendered form via a double-submit nonce.
        if(!['/login','/logout'].includes(url.pathname) || fetchSite!=='same-origin' || request.headers.get('sec-fetch-mode')!=='navigate')
          return json({error:'Invalid origin'},403);
      } else if (origin && origin!==trustedOrigin) return json({error:'Invalid origin'},403);
      else if (!origin && fetchSite && fetchSite!=='same-origin') return json({error:'Invalid origin'},403);
    }
    if(url.pathname==='/login' && request.method==='POST') {
      const form=await request.formData().catch(()=>null);
      const key=form?.get('key');
      if(isNullOrigin) {
        const nonce = form?.get('csrf');
        const csrfCookie = cookie.match(/(?:^|;\s*)__Host-siteops_csrf=([0-9a-f-]{36})(?:;|$)/)?.[1];
        if (typeof nonce!=='string' || !csrfCookie || !safeEqual(nonce,csrfCookie))
          return json({error:'Invalid login form token. Refresh the login page and try again.'},403);
      }
      if(typeof key!=='string'||key!==env.SCAN_API_KEY) return loginResponse(true,401);
      const token=await newSession(env.SCAN_API_KEY);
      return new Response(null,{status:303,headers:{location:'/dashboard','set-cookie':`siteops_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600`,'cache-control':'no-store'}});
    }
    if(url.pathname==='/logout' && request.method==='POST') {
      if(!session) return json({error:'Unauthorized'},401);
      const form=await request.formData().catch(()=>null);
      const nonce=form?.get('csrf');
      const csrfCookie=cookie.match(/(?:^|;\s*)__Host-siteops_csrf=([0-9a-f-]{36})(?:;|$)/)?.[1];
      if(typeof nonce!=='string'||!csrfCookie||!safeEqual(nonce,csrfCookie)) return json({error:'Invalid logout form token'},403);
      return new Response(null,{status:303,headers:{location:'/dashboard','set-cookie':'siteops_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'}});
    }
    if((url.pathname==='/'||url.pathname==='/dashboard') && request.method==='GET') return session?dashboardResponse(env.TEST_TARGET):loginResponse();
    // SiteOps v0.5 report routes: authenticated access only.
    if(url.pathname==='/api/reports' && request.method==='GET') {
      if(!authenticated) return json({error:'Unauthorized'},401);
      const rows=await env.DB.prepare('SELECT id,scan_id,website,created_at,source,report_json FROM reports WHERE website=? ORDER BY id DESC LIMIT 30').bind(env.TEST_TARGET).all();
      return json({reports:rows.results.map(r=>({id:r.id,scanId:r.scan_id,website:r.website,createdAt:r.created_at,source:r.source,outcome:JSON.parse(r.report_json).outcome}))});
    }
    const reportMatch=url.pathname.match(/^\/api\/reports\/(\d+)\/html$/);
    if(reportMatch && request.method==='GET') {
      if(!authenticated) return json({error:'Unauthorized'},401);
      const row=await env.DB.prepare('SELECT report_json FROM reports WHERE id=? AND website=?').bind(Number(reportMatch[1]),env.TEST_TARGET).first();
      if(!row) return json({error:'Report not found'},404);
      return new Response(reportHtml(JSON.parse(row.report_json)),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','x-frame-options':'DENY','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
    }
    if(url.pathname==='/api/history' && request.method==='GET') {
      if(!authenticated) return json({error:'Unauthorized'},401);
      const target=allowedTarget(env.TEST_TARGET,env).href;
      const rows=await env.DB.prepare('SELECT id,checked_at,result_json,comparison_json FROM scans WHERE website=? ORDER BY id DESC LIMIT 30').bind(target).all();
      return json({scans:rows.results.map(r=>{let a=JSON.parse(r.result_json),b=JSON.parse(r.comparison_json);return {id:r.id,checkedAt:r.checked_at,status:a.status,changed:b.changed,critical:b.critical}})});
    }
    if(url.pathname!=='/api/scan'||request.method!=='POST') return json({error:'Not found'},404);
    if(!authenticated) return json({error:'Unauthorized'},401);
    let payload;
    try{payload=await request.json();}catch{return json({error:'Invalid JSON'},400);}
    const submitted=payload?.url??env.TEST_TARGET;
    if(typeof submitted!=='string')return json({error:'url must be a string'},400);
    let target;
    try{target=allowedTarget(submitted,env);}catch{return json({error:'Only the configured test website is allowed'},400);}
    try {
      const result=await createScanAndReport(env,scan,compare,'manual');
      return json(result);
    }catch(e){return json({error:'Scan unsuccessful',detail:String(e?.message||e).slice(0,180)},502);}
  }
};
async function keyFor(secret){return crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
function hex(a){return Array.from(new Uint8Array(a),b=>b.toString(16).padStart(2,'0')).join('');}
async function newSession(secret){const expires=Date.now()+3600_000;const nonce=crypto.randomUUID();const data=`${expires}.${nonce}`;const sig=hex(await crypto.subtle.sign('HMAC',await keyFor(secret),new TextEncoder().encode(data)));return `${data}.${sig}`;}
async function validSession(value,secret){const parts=value.split('.');if(parts.length!==3)return false;const [time,nonce,sig]=parts;if(!/^\d{13}$/.test(time)||Date.now()>Number(time)||Number(time)>Date.now()+3600_000||!/^[0-9a-f-]{36}$/.test(nonce)||!/^[0-9a-f]{64}$/.test(sig))return false;return crypto.subtle.verify('HMAC',await keyFor(secret),Uint8Array.from(sig.match(/../g).map(x=>parseInt(x,16))),new TextEncoder().encode(`${time}.${nonce}`));}

function safeEqual(a,b) {
  if (a.length!==b.length) return false;
  let diff=0;
  for(let i=0;i<a.length;i++) diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
function loginResponse(error=false,status=200) {
  const nonce=crypto.randomUUID();
  const form=loginPage(error).replace('<form method="post" action="/login">', `<form method="post" action="/login"><input type="hidden" name="csrf" value="${nonce}">`);
  return new Response(form,{status,headers:{
    'content-type':'text/html; charset=utf-8', 'cache-control':'no-store',
    'x-frame-options':'DENY','x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer',
    'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    'set-cookie':`__Host-siteops_csrf=${nonce}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=600`
  }});
}

function dashboardResponse(target) {
  const nonce=crypto.randomUUID();
  const markup=dashboardPage(target).replace('<form method="post" action="/logout">', `<form method="post" action="/logout"><input type="hidden" name="csrf" value="${nonce}">`);
  return new Response(markup,{status:200,headers:{
    'content-type':'text/html; charset=utf-8','cache-control':'no-store',
    'x-frame-options':'DENY','x-content-type-options':'nosniff','referrer-policy':'no-referrer',
    'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    'set-cookie':`__Host-siteops_csrf=${nonce}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=600`
  }});
}
