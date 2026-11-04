// SiteOps v0.7.0: internal, account-scoped persistence primitives.
// No HTTP routes or scheduled customer jobs are enabled by this module.
import {buildReport} from './reports.js';

const uuid = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function scope(accountId,siteId){
  if(!uuid(accountId)||!uuid(siteId)) throw new TypeError('Valid account and site identifiers required');
}

export async function storeCustomerScanReport(db,{accountId,siteId,scan,comparison,source='manual'}){
  scope(accountId,siteId);
  if(!['manual','scheduled'].includes(source)) throw new TypeError('Unsupported scan source');
  if(!scan || typeof scan!=='object' || !Number.isInteger(scan.status) ||
    typeof scan.requestedUrl!=='string' || typeof scan.checkedAt!=='string' ||
    !Number.isFinite(Date.parse(scan.checkedAt)) || !comparison || typeof comparison!=='object' ||
    !Number.isInteger(comparison.changed) || !Number.isInteger(comparison.critical) ||
    !Array.isArray(comparison.findings)) throw new TypeError('Invalid scan and comparison');
  // Confirm association before storing; use a second SQL-level gate within the batch
  // so a concurrent ownership revocation cannot produce an unscoped scan.
  const site=await db.prepare("SELECT url FROM monitored_sites WHERE account_id=? AND id=? AND verification_state='verified'")
    .bind(accountId,siteId).first();
  if(!site || site.url!==scan.requestedUrl) throw new Error('Verified site not found or scan URL does not match');
  const scanId=crypto.randomUUID(),reportId=crypto.randomUUID();
  const report=buildReport(scan,comparison,scanId);
  const result=await db.batch([
    db.prepare(`INSERT INTO customer_scans (id,account_id,site_id,checked_at,source,result_json,comparison_json)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM monitored_sites
      WHERE account_id=? AND id=? AND url=? AND verification_state='verified')`)
      .bind(scanId,accountId,siteId,scan.checkedAt,source,JSON.stringify(scan),JSON.stringify(comparison),accountId,siteId,scan.requestedUrl),
    db.prepare(`INSERT INTO customer_reports (id,account_id,site_id,scan_id,created_at,report_json)
      SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM customer_scans WHERE account_id=? AND site_id=? AND id=?)`)
      .bind(reportId,accountId,siteId,scanId,scan.checkedAt,JSON.stringify(report),accountId,siteId,scanId)
  ]);
  if(result?.[0]?.meta?.changes!==1 || result?.[1]?.meta?.changes!==1)
    throw new Error('Scan/report was not persisted; retry only after validating ownership and database state');
  return {scanId,reportId,report};
}

export async function listCustomerScans(db,{accountId,siteId,limit=30}){
  scope(accountId,siteId);
  if(!Number.isInteger(limit)||limit<1||limit>100) throw new RangeError('Limit must be 1–100');
  const rows=await db.prepare(`SELECT id,checked_at,source,result_json,comparison_json FROM customer_scans
    WHERE account_id=? AND site_id=? ORDER BY checked_at DESC,id DESC LIMIT ?`)
    .bind(accountId,siteId,limit).all();
  return rows.results.map(r=>({id:r.id,checkedAt:r.checked_at,source:r.source,scan:JSON.parse(r.result_json),comparison:JSON.parse(r.comparison_json)}));
}

export async function listCustomerReports(db,{accountId,siteId,limit=30}){
  scope(accountId,siteId);
  if(!Number.isInteger(limit)||limit<1||limit>100) throw new RangeError('Limit must be 1–100');
  const rows=await db.prepare(`SELECT id,scan_id,created_at,report_json FROM customer_reports
    WHERE account_id=? AND site_id=? ORDER BY created_at DESC,id DESC LIMIT ?`)
    .bind(accountId,siteId,limit).all();
  return rows.results.map(r=>({id:r.id,scanId:r.scan_id,createdAt:r.created_at,report:JSON.parse(r.report_json)}));
}
