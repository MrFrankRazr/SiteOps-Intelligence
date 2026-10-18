// SiteOps v0.6.2 invite-only customer API. Calls must be routed BEFORE the v0.5 fallback.
// This module never exposes legacy scans/reports and never trusts account IDs without membership checks.
const reply=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),x=>x.toString(16).padStart(2,'0')).join('');
const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
const now=()=>new Date().toISOString();
export function normalizedSite(raw){
  const u=new URL(raw);
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||u.pathname!=='/'||!u.hostname.includes('.')||u.hostname.endsWith('.local')||!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(u.hostname))throw Error('Provide an HTTPS domain root without paths, ports or parameters');
  return u.origin+'/';
}
export async function authenticate(db,request){
  const auth=request.headers.get('authorization')||'';
  if(!/^Bearer [0-9a-f]{64}$/.test(auth))return null;
  const hash=await digest(auth.slice(7));
  return db.prepare(`SELECT u.id user_id FROM customer_access_tokens t JOIN account_users u ON u.id=t.user_id WHERE t.token_hash=? AND t.revoked_at IS NULL AND t.expires_at>?`).bind(hash,now()).first();
}
export async function requireMember(db,userId,accountId,write=false){
  if(!accountId||typeof accountId!=='string')return null;
  const member=await db.prepare(`SELECT m.role FROM account_members m JOIN accounts a ON a.id=m.account_id WHERE m.user_id=? AND m.account_id=? AND a.status IN ('pilot','active')`).bind(userId,accountId).first();
  if(!member||write&&member.role==='viewer')return null;
  return member;
}
async function jsonBody(request){
  if(Number(request.headers.get('content-length')||0)>4096)throw Error('Request too large');
  const value=await request.json();if(!value||Array.isArray(value)||typeof value!=='object')throw Error('Invalid body');return value;
}
export async function issuePilotAccess(db,{email,accountName}){
  if(typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||typeof accountName!=='string'||!accountName.trim()||accountName.length>100)throw Error('Invalid pilot account');
  const id=crypto.randomUUID(),uid=crypto.randomUUID(),token=randomToken(),tokenId=crypto.randomUUID(),exp=new Date(Date.now()+7*864e5).toISOString();
  // Batch is atomic in D1; no partial invitation records.
  await db.batch([
    db.prepare('INSERT INTO accounts (id,name,status) VALUES (?,?,?)').bind(id,accountName.trim(),'pilot'),
    db.prepare('INSERT INTO account_users (id,email_normalized,identity_provider,provider_subject) VALUES (?,?,?,?)').bind(uid,email.toLowerCase().trim(),'siteops-pilot-token',uid),
    db.prepare('INSERT INTO account_members (account_id,user_id,role) VALUES (?,?,?)').bind(id,uid,'owner'),
    db.prepare('INSERT INTO customer_access_tokens (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)').bind(tokenId,uid,await digest(token),exp)
  ]);
  return {accountId:id,userId:uid,accessToken:token,expiresAt:exp};
}
export async function verifySiteTxt(db,site,resolveTxt){
  const url=new URL(site.url),expectedHash=site.verification_token_hash;
  if(!expectedHash)return false;
  const txt=await resolveTxt('_siteops-verify.'+url.hostname);
  const normalized=Array.isArray(txt)?txt.map(x=>String(x).replace(/^"|"$/g,'')):[];
  for(const value of normalized){if(await digest(value)===expectedHash)return true;}
  return false;
}
export async function customerRoute(request,env,{resolveTxt}={}){
  const u=new URL(request.url);if(!u.pathname.startsWith('/api/customer/'))return null;
  if(env.CUSTOMER_API_ENABLED!=='true')return reply({error:'Customer pilot disabled'},404);
  if(!env.DB)return reply({error:'Database unavailable'},503);
  // Customer APIs are strictly bearer-authenticated, no browser-cookie authority.
  const identity=await authenticate(env.DB,request);if(!identity)return reply({error:'Unauthorized'},401);
  if(!['GET','POST'].includes(request.method))return reply({error:'Method not allowed'},405);
  if(request.method==='POST'){
    const origin=request.headers.get('origin');
    const site=request.headers.get('sec-fetch-site');
    if(origin||site==='cross-site'||site==='none')return reply({error:'Cross-origin customer write blocked'},403);
  }
  try {
    if(u.pathname==='/api/customer/accounts'&&request.method==='GET'){
      const rows=await env.DB.prepare(`SELECT a.id,a.name,m.role FROM accounts a JOIN account_members m ON m.account_id=a.id WHERE m.user_id=? AND a.status IN ('pilot','active') ORDER BY a.name`).bind(identity.user_id).all();
      return reply({accounts:rows.results});
    }
    const match=u.pathname.match(/^\/api\/customer\/accounts\/([0-9a-f-]{36})\/sites(?:\/([0-9a-f-]{36})\/verify)?$/);
    if(!match)return reply({error:'Not found'},404);
    const [,accountId,siteId]=match;
    const member=await requireMember(env.DB,identity.user_id,accountId,request.method==='POST');
    if(!member)return reply({error:'Not found'},404);
    if(!siteId&&request.method==='GET'){
      const rows=await env.DB.prepare('SELECT id,url,verification_state,monitoring_enabled,verified_at FROM monitored_sites WHERE account_id=? ORDER BY created_at DESC').bind(accountId).all();
      return reply({sites:rows.results});
    }
    if(!siteId&&request.method==='POST'){
      const body=await jsonBody(request),url=normalizedSite(body.url),token='siteops-verification='+randomToken(),siteId=crypto.randomUUID();
      await env.DB.prepare('INSERT INTO monitored_sites (id,account_id,url,verification_state,verification_token_hash,monitoring_enabled) VALUES (?,?,?,?,?,0)').bind(siteId,accountId,url,'pending',await digest(token)).run();
      return reply({siteId,url,state:'pending',dnsName:'_siteops-verify.'+new URL(url).hostname,dnsTxtValue:token},201);
    }
    if(siteId&&request.method==='POST'){
      const site=await env.DB.prepare('SELECT id,url,verification_token_hash,verification_state FROM monitored_sites WHERE id=? AND account_id=?').bind(siteId,accountId).first();
      if(!site)return reply({error:'Not found'},404);
      if(site.verification_state==='verified')return reply({state:'verified'});
      if(!resolveTxt)return reply({error:'DNS verifier not configured'},503);
      if(!await verifySiteTxt(env.DB,site,resolveTxt))return reply({error:'DNS TXT record not verified'},409);
      await env.DB.prepare("UPDATE monitored_sites SET verification_state='verified',verified_at=?,verification_token_hash=NULL WHERE id=? AND account_id=?").bind(now(),siteId,accountId).run();
      return reply({state:'verified'});
    }
    return reply({error:'Method not allowed'},405);
  }catch(e){return reply({error:e?.message==='Request too large'?'Request too large':String(e.message||e).slice(0,160)},400);}
}
