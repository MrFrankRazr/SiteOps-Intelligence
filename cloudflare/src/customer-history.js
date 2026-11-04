// SiteOps v0.7.0: read-only customer history routes. No scan execution or monitoring toggles.
import {authenticate, requireMember} from './customer.js';
import {listCustomerScans, listCustomerReports} from './customer-records.js';
const respond=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const route=new RegExp(`^/api/customer/accounts/(${UUID})/sites/(${UUID})/(scans|reports)$`,'i');

export async function customerHistoryRoute(request,env){
  const path=new URL(request.url).pathname;
  const m=route.exec(path);
  if(!m)return null;
  if(env.CUSTOMER_API_ENABLED!=='true')return respond({error:'Not found'},404);
  if(!env.DB)return respond({error:'Database unavailable'},503);
  if(request.method!=='GET')return respond({error:'Method not allowed'},405);
  // Exact bearer authentication; never authorize from browser cookies.
  const identity=await authenticate(env.DB,request);
  if(!identity)return respond({error:'Unauthorized'},401);
  const [,accountId,siteId,kind]=m;
  const member=await requireMember(env.DB,identity.user_id,accountId,false);
  if(!member)return respond({error:'Not found'},404);
  const site=await env.DB.prepare('SELECT id FROM monitored_sites WHERE id=? AND account_id=?')
    .bind(siteId,accountId).first();
  if(!site)return respond({error:'Not found'},404);
  try{
    if(kind==='scans')return respond({scans:await listCustomerScans(env.DB,{accountId,siteId})});
    return respond({reports:await listCustomerReports(env.DB,{accountId,siteId})});
  }catch{
    // Do not reveal SQL or tenant data in error responses.
    return respond({error:'Customer history temporarily unavailable'},503);
  }
}
