// SiteOps v0.5: reporting and scheduled execution. Authorized single test target only.
export function escapeHtml(value) {return String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function buildReport(scan,comparison,id) {
  const findings = comparison.findings || [];
  const outcome = comparison.baseline ? 'Baseline established' : comparison.critical ? 'Critical regression detected' : findings.length ? 'Review required' : 'No changes detected';
  return {scanId:id, website:scan.requestedUrl, checkedAt:scan.checkedAt, status:scan.status, title:scan.title, finalUrl:scan.finalUrl, canonical:scan.canonical, changed:comparison.changed, critical:comparison.critical, baseline:!!comparison.baseline, findings, outcome};
}
export function reportHtml(report) {
  const list=report.findings.length?`<table><thead><tr><th>Severity</th><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>${report.findings.map(f=>`<tr><td>${escapeHtml(f.severity)}</td><td>${escapeHtml(f.field)}</td><td>${escapeHtml(JSON.stringify(f.before))}</td><td>${escapeHtml(JSON.stringify(f.after))}</td></tr>`).join('')}</tbody></table>`:'<p>No changes identified in the fields monitored.</p>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>SiteOps Verification Report #${Number(report.scanId)}</title><style>body{font:15px/1.6 system-ui,Segoe UI,sans-serif;margin:0;background:#081525;color:#eaf6ff}main{max-width:850px;margin:auto;padding:40px 24px}h1{color:#35d7ef}section{background:#10243b;border:1px solid #28455c;padding:22px;border-radius:12px;margin:20px 0}table{border-collapse:collapse;width:100%}td,th{padding:10px;text-align:left;border-bottom:1px solid #28455c;word-break:break-word}.subtle{color:#bdd0dc}button{background:#35d7ef;border:0;border-radius:8px;padding:11px 16px;cursor:pointer}@media print{body{background:white;color:black}h1{color:#11677a}section{background:white;border-color:#888}button{display:none}td,th{border-color:#999}.subtle{color:#555}}</style></head><body><main><h1>SITEOPS INTELLIGENCE</h1><p class="subtle">Website verification report • Internal pilot</p><section><h2>${escapeHtml(report.outcome)}</h2><p><strong>Website:</strong> ${escapeHtml(report.website)}<br><strong>Scan:</strong> ${escapeHtml(report.checkedAt)}<br><strong>HTTP:</strong> ${Number(report.status)}<br><strong>Changes:</strong> ${Number(report.changed)}<br><strong>Critical:</strong> ${Number(report.critical)}</p></section><section><h2>Technical observations</h2><p><strong>Page title:</strong> ${escapeHtml(report.title)}<br><strong>Final URL:</strong> ${escapeHtml(report.finalUrl)}<br><strong>Canonical:</strong> ${escapeHtml(report.canonical)}</p>${list}</section><p class="subtle">Externally observable checks only. This is not a guarantee of full website functionality. Use Print → Save as PDF for export.</p><button onclick="window.print()">Print / Save as PDF</button></main></body></html>`;
}
export async function persistReport(db,scan,comparison,scanId,source) {
  const report=buildReport(scan,comparison,scanId);
  await db.prepare('INSERT INTO reports (scan_id,website,created_at,source,report_json) VALUES (?,?,?,?,?)').bind(scanId,scan.requestedUrl,scan.checkedAt,source,JSON.stringify(report)).run();
  return report;
}
export async function createScanAndReport(env, scanFn,compareFn,source='manual') {
  const target=env.TEST_TARGET;
  const last=await env.DB.prepare('SELECT result_json FROM scans WHERE website=? ORDER BY id DESC LIMIT 1').bind(target).first();
  const current=await scanFn(target,env);
  const comparison=compareFn(last?JSON.parse(last.result_json):null,current);
  const write=await env.DB.prepare('INSERT INTO scans (website,checked_at,result_json,comparison_json) VALUES (?,?,?,?)').bind(target,current.checkedAt,JSON.stringify(current),JSON.stringify(comparison)).run();
  const id=write.meta?.last_row_id;
  if(!Number.isInteger(id)) throw Error('Cannot determine scan ID');
  const report=await persistReport(env.DB,current,comparison,id,source);
  return {scan:current,comparison,report};
}
export async function scheduledScan(env,scanFn,compareFn){
  if (!env.DB || !env.TEST_TARGET) throw Error('Scheduled scanner missing D1 or target');
  // Scheduled scans are limited to the same preconfigured allowlisted test target as manual scans.
  return createScanAndReport(env,scanFn,compareFn,'scheduled');
}
