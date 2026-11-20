// A scheduled check of the dedicated, operator-owned staging endpoint.
const accountId = '3eed56c9-91ed-4be1-897b-ace60995635c';
const siteId = '658c5e7c-d5e9-46ea-8b6e-794649b74a90';
const target = 'https://siteops-test.paddockcommand.com/';
const cron = '*/15 * * * *';
const eligibility = `FROM monitored_sites s JOIN accounts a ON a.id=s.account_id
  WHERE s.account_id=? AND s.id=? AND s.url=? AND s.verification_state='verified'
    AND a.status IN ('pilot','active')`;

export async function runStagingPilotCheck(event, env, fetchTarget = fetch) {
  if (env.PILOT_CRON_ENABLED !== 'true' || event.cron !== cron) return 'disabled';

  const slot = new Date(event.scheduledTime).toISOString();
  const id = 'staging-pilot-cron-' + slot;
  const scope = [accountId, siteId, target];
  const eligible = await env.DB.prepare(`SELECT 1 ${eligibility}
    AND NOT EXISTS (SELECT 1 FROM customer_scans WHERE id=?)`).bind(...scope, id).first();
  if (!eligible) return 'skipped';

  const start = performance.now();
  const response = await fetchTarget(target, {
    method: 'GET',
    redirect: 'manual',
    signal: AbortSignal.timeout(8000)
  });
  const scan = {
    requestedUrl: target,
    finalUrl: target,
    status: response.status,
    checkedAt: new Date().toISOString(),
    responseTimeMs: Math.round(performance.now() - start),
    scheduledAt: slot,
    title: null,
    canonical: null
  };
  await response.body?.cancel();
  if (scan.status < 200 || scan.status > 599) throw new Error('Invalid pilot HTTP status');

  const comparison = { changed: 0, critical: 0, findings: [], baseline: true };
  const result = await env.DB.prepare(`INSERT INTO customer_scans
    (id,account_id,site_id,checked_at,source,result_json,comparison_json)
    SELECT ?,s.account_id,s.id,?,'scheduled',?,? ${eligibility}
    ON CONFLICT(id) DO NOTHING`).bind(
    id, scan.checkedAt, JSON.stringify(scan), JSON.stringify(comparison), ...scope
  ).run();
  if (!result.success) throw new Error('Pilot scan could not be saved');
  return result.meta.changes === 1 ? 'saved' : 'skipped';
}

export default {
  async scheduled(event, env) {
    const outcome = await runStagingPilotCheck(event, env);
    console.log('Staging pilot check', outcome, event.scheduledTime);
  }
};
