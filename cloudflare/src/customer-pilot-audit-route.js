// SiteOps v0.7.2 Phase J: staging-only, owner/admin read-only audit endpoint.
// No network scans, Cron, D1 writes, customer record exposure or token management.
import {authenticate, requireMember} from './customer.js';
import {summarizePilotDryRun} from './customer-pilot-audit.js';
const respond=(body,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store','x-content-type-options':'nosniff'}
});
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const matchAudit=new RegExp(`^/api/customer/accounts/(${UUID})/pilot-audit$`,'i');
export async function customerPilotAuditRoute(request,env={}) {
  const match=matchAudit.exec(new URL(request.url).pathname);
  if(!match) return null;
  // Feature unavailable unless the exact staging worker opts in.
  if(env.CUSTOMER_PILOT_AUDIT_ROUTE_ENABLED!=='true' ||
     env.CUSTOMER_API_ENABLED!=='true') return respond({error:'Not found'},404);
  if(request.method!=='GET') return respond({error:'Method not allowed'},405);
  if(!env.DB) return respond({error:'Service unavailable'},503);
  try {
    const identity=await authenticate(env.DB,request);
    if(!identity)return respond({error:'Unauthorized'},401);
    const accountId=match[1];
    // Route never permits querying a different tenant, even if caller has access.
    if(accountId!==env.CUSTOMER_PILOT_ACCOUNT_ID) return respond({error:'Not found'},404);
    const member=await requireMember(env.DB,identity.user_id,accountId,true);
    if(!member || !['owner','admin'].includes(member.role))return respond({error:'Not found'},404);
    const summary=await summarizePilotDryRun(env.DB,env);
    return respond({
      dryRun:true,scheduledScanningActive:false,
      eligibleCount:summary.eligibleCount,state:summary.state
    });
  }catch {
    return respond({error:'Service unavailable'},503);
  }
}
