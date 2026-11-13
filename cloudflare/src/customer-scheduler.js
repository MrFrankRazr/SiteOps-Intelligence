// SiteOps v0.7.2 phase A: eligibility and bounded selection ONLY.
// This module does not fetch URLs, persist scans, enable monitoring, or install a Cron trigger.
const MAX_BATCH = 10;

export function customerSchedulerEnabled(env) {
  return env?.CUSTOMER_API_ENABLED === 'true' &&
    env?.CUSTOMER_SCHEDULER_ENABLED === 'true';
}

export function normalizeBatchSize(value) {
  if (value === undefined || value === null) return 5;
  if (!Number.isInteger(value) || value < 1 || value > MAX_BATCH) {
    throw new RangeError(`Customer scheduler batch size must be 1-${MAX_BATCH}`);
  }
  return value;
}

// Customer monitoring preference is necessary but not sufficient for execution.
// Eligibility also requires a verified site, an active account, and an explicit scheduler flag.
export async function listEligibleCustomerSites(db, env, {limit = 5} = {}) {
  if (!customerSchedulerEnabled(env)) return [];
  if (!db || typeof db.prepare !== 'function') throw new TypeError('D1 binding required');
  const batch = normalizeBatchSize(limit);
  const rows = await db.prepare(`
    SELECT s.id AS site_id, s.account_id, s.url
    FROM monitored_sites s
    JOIN accounts a ON a.id = s.account_id
    WHERE s.monitoring_enabled = 1
      AND s.verification_state = 'verified'
      AND a.status = 'active'
    ORDER BY s.created_at ASC, s.id ASC
    LIMIT ?
  `).bind(batch).all();
  if (!Array.isArray(rows?.results)) throw new Error('Unexpected D1 result');
  return rows.results.map(row => ({
    accountId: row.account_id,
    siteId: row.site_id,
    url: row.url
  }));
}

// Intentional disabled stub. No network access, no D1 writes, no scheduled execution.
export async function customerSchedulerDryRun(db, env, options) {
  const sites = await listEligibleCustomerSites(db, env, options);
  return {dryRun: true, scheduledScanningActive: false, eligibleCount: sites.length, sites};
}
