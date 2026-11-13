// SiteOps v0.7.1 staging-only customer monitoring preference controls.
// This route never runs scans or schedules jobs.
import {authenticate,requireMember} from './customer.js';
const respond=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const route=new RegExp(`^/api/customer/accounts/(${UUID})/sites/(${UUID})/monitoring$`,'i');

export async function customerMonitoringRoute(request,env){
  const url=new URL(request.url);
  const match=route.exec(url.pathname);
  if(!match)return null;
  if(env.CUSTOMER_API_ENABLED!=='true'||env.CUSTOMER_MONITORING_CONTROLS_ENABLED!=='true')return respond({error:'Not found'},404);
  if(!env.DB)return respond({error:'Database unavailable'},503);
  if(request.method!=='POST')return respond({error:'Method not allowed'},405);
  const identity=await authenticate(env.DB,request);
  if(!identity)return respond({error:'Unauthorized'},401);
  const origin=request.headers.get('origin');
  const fetchSite=request.headers.get('sec-fetch-site');
  const trusted=env.DASHBOARD_ORIGIN||url.origin;
  if(origin==='null'||fetchSite==='cross-site'||fetchSite==='none'||(origin&&origin!==trusted)||(!origin&&fetchSite==='same-origin'))return respond({error:'Cross-origin customer write blocked'},403);
  const [,accountId,siteId]=match;
  const member=await requireMember(env.DB,identity.user_id,accountId,true);
  if(!member)return respond({error:'Not found'},404);
  let body;
  try {
    if(Number(request.headers.get('content-length')||0)>1024)return respond({error:'Request too large'},413);
    const raw=await request.text();
    if(new TextEncoder().encode(raw).length>1024)return respond({error:'Request too large'},413);
    body=JSON.parse(raw);
  }catch{return respond({error:'Invalid JSON'},400);}
  if(!body||Array.isArray(body)||typeof body!=='object'||typeof body.enabled!=='boolean'||Object.keys(body).length!==1)return respond({error:'Expected {enabled: boolean}'},400);
  try {
    const site=await env.DB.prepare('SELECT verification_state,monitoring_enabled FROM monitored_sites WHERE account_id=? AND id=?').bind(accountId,siteId).first();
    if(!site)return respond({error:'Not found'},404);
    if(body.enabled&&site.verification_state!=='verified')return respond({error:'Website ownership must be verified'},409);
    // Atomic SQL gate: even if verification changes after SELECT, enabling cannot bypass verification.
    const result=await env.DB.prepare(`UPDATE monitored_sites SET monitoring_enabled=? WHERE account_id=? AND id=? AND (?=0 OR verification_state='verified')`).bind(body.enabled?1:0,accountId,siteId,body.enabled?1:0).run();
    if(result?.meta?.changes===0){
      // A no-op update may report zero changes. Re-read to distinguish from concurrent revocation.
      const current=await env.DB.prepare('SELECT verification_state,monitoring_enabled FROM monitored_sites WHERE account_id=? AND id=?').bind(accountId,siteId).first();
      if(!current)return respond({error:'Not found'},404);
      if(body.enabled&&current.verification_state!=='verified')return respond({error:'Website ownership must be verified'},409);
      if(Boolean(current.monitoring_enabled)!==body.enabled)return respond({error:'Monitoring update not applied'},503);
    }
    return respond({siteId,monitoringEnabled:body.enabled,scheduledScanningActive:false});
  }catch{return respond({error:'Monitoring controls temporarily unavailable'},503);}
}
