// SiteOps v0.7.2 Phase F: fail-closed pilot authorization decision only.
// No outbound fetch, cron, DB queries, or entitlement to scan arbitrary websites.
// A future adapter must enforce approved destinations at network connection time.
export function decidePilotScan(input, env = {}) {
  if (env.CUSTOMER_PILOT_SCAN_ENABLED !== 'true')
    return Object.freeze({allowed:false,reason:'pilot-disabled'});
  return evaluatePinnedPilotEligibility(input, env);
}

// Read-only eligibility shared by the scan gate and the audit.
export function evaluatePinnedPilotEligibility(input, env = {}) {
  const deny = (reason) => Object.freeze({allowed:false,reason});
  if (env.CUSTOMER_API_ENABLED !== 'true' ||
      env.CUSTOMER_MONITORING_CONTROLS_ENABLED !== 'true') return deny('pilot-disabled');
  if (!input || typeof input !== 'object' || Array.isArray(input)) return deny('invalid-input');
  const {accountId,siteId,accountStatus,verificationState,monitoringEnabled,siteUrl} = input;
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof accountId !== 'string' || !uuid.test(accountId) ||
      typeof siteId !== 'string' || !uuid.test(siteId)) return deny('invalid-identity');
  if (!['pilot','active'].includes(accountStatus) || verificationState !== 'verified' ||
      monitoringEnabled !== true) return deny('not-eligible');
  // Exact, config-pinned pilot identifiers prevent selection of unrelated records.
  if (accountId !== env.CUSTOMER_PILOT_ACCOUNT_ID ||
      siteId !== env.CUSTOMER_PILOT_SITE_ID) return deny('unapproved-record');
  if (typeof siteUrl !== 'string' || typeof env.CUSTOMER_PILOT_TARGET !== 'string')
    return deny('unapproved-target');
  let url,approved;
  try {url=new URL(siteUrl); approved=new URL(env.CUSTOMER_PILOT_TARGET);} catch {return deny('unapproved-target');}
  // Ignore no URL components: enforce one exact canonical URL, no fragment or credentials.
  if (url.protocol!=='https:' || approved.protocol!=='https:' ||
      url.username || url.password || approved.username || approved.password ||
      url.hash || approved.hash || url.port || approved.port ||
      url.href !== approved.href || siteUrl !== approved.href ||
      env.CUSTOMER_PILOT_TARGET !== approved.href) return deny('unapproved-target');
  // The permission is NOT a connection permit: it is only a database/job eligibility decision.
  return Object.freeze({allowed:true,reason:'approved-pilot-eligibility',accountId,siteId,target:approved.href});
}
