// SiteOps v0.7.2 Phase H: read-only audit summary, NO HTTP route or network access.
// Not a scheduling permission and never exposes account/site identifiers or URLs.
import {pilotEligibilityDryRun} from './customer-pilot-dryrun.js';
const disabled = () => ({dryRun:true,scheduledScanningActive:false,eligibleCount:0,state:'disabled'});
export async function summarizePilotDryRun(db,env={}) {
  // A separate opt-in for reading staging D1 in the audit workflow.
  if(env.CUSTOMER_PILOT_AUDIT_ENABLED!=='true' ||
     env.CUSTOMER_API_ENABLED!=='true' ||
     env.CUSTOMER_MONITORING_CONTROLS_ENABLED!=='true' ||
     env.CUSTOMER_PILOT_SCAN_ENABLED!=='true') return disabled();
  if (!db || typeof db.prepare!=='function')
    return { ...disabled(), state:'unavailable' };
  try {
    const result=await pilotEligibilityDryRun(db,env);
    if(result?.dryRun!==true || result?.scheduledScanningActive!==false ||
       !Number.isInteger(result?.eligibleCount) || result.eligibleCount<0 || result.eligibleCount>1 ||
       !Array.isArray(result.sites) || result.sites.length!==result.eligibleCount)
      return {...disabled(),state:'unavailable'};
    return {dryRun:true,scheduledScanningActive:false,eligibleCount:result.eligibleCount,
      state:result.eligibleCount===1?'eligible':'ineligible'};
  } catch {
    // Database and internal errors are not copied into the audit output.
    return {...disabled(),state:'unavailable'};
  }
}
