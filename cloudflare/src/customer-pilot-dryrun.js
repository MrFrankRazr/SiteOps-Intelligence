// SiteOps v0.7.2 Phase G — offline-only account/site eligibility adapter.
// NO fetch(), Cron, SQL writes, API endpoint or network egress.
import {evaluatePinnedPilotEligibility} from './customer-pilot-gate.js';
const EMPTY = Object.freeze({dryRun:true,scheduledScanningActive:false,eligibleCount:0,sites:[]});
export async function pilotEligibilityDryRun(db,env={}) {
  if (env.CUSTOMER_API_ENABLED!=='true' ||
      env.CUSTOMER_MONITORING_CONTROLS_ENABLED!=='true') return {...EMPTY,sites:[]};
  if (!db || typeof db.prepare!=='function') throw new TypeError('D1 required');
  if(typeof env.CUSTOMER_PILOT_ACCOUNT_ID!=='string' || typeof env.CUSTOMER_PILOT_SITE_ID!=='string')
    return {...EMPTY,sites:[]};
  // Both tenant identifiers are bound, not interpolated. One record maximum.
  const row=await db.prepare(`SELECT s.id AS site_id,s.account_id,s.url AS site_url,
      s.verification_state,s.monitoring_enabled,a.status AS account_status
      FROM monitored_sites s JOIN accounts a ON a.id=s.account_id
      WHERE s.account_id=? AND s.id=? LIMIT 1`)
    .bind(env.CUSTOMER_PILOT_ACCOUNT_ID,env.CUSTOMER_PILOT_SITE_ID).first();
  if (!row) return {...EMPTY,sites:[]};
  const decision=evaluatePinnedPilotEligibility({
    accountId:row.account_id,siteId:row.site_id,siteUrl:row.site_url,
    accountStatus:row.account_status,verificationState:row.verification_state,
    monitoringEnabled:row.monitoring_enabled===1
  },env);
  if(!decision.allowed)return {...EMPTY,sites:[]};
  // The response is an audit preview, not an execution permit.
  return {dryRun:true,scheduledScanningActive:false,eligibleCount:1,
    sites:[{accountId:decision.accountId,siteId:decision.siteId,url:decision.target}]};
}
