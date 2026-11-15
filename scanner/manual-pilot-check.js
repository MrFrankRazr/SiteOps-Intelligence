import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { writeFile } from 'node:fs/promises';
import { request } from 'node:https';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { assessCustomerDnsAnswers } from '../cloudflare/src/customer-dns-policy.js';
import { normalizeUrl, pinnedLookup } from './engine.js';

const accountId = '3eed56c9-91ed-4be1-897b-ace60995635c';
const siteId = '658c5e7c-d5e9-46ea-8b6e-794649b74a90';
const target = normalizeUrl('https://siteops-test.paddockcommand.com/');
const timeoutMs = 8000;

export async function checkPilot({ resolve = lookup, send = request } = {}) {
  const started = performance.now();
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('Pilot HTTPS check timed out'));
      controller.abort();
    }, timeoutMs);
  });

  const check = async () => {
    const hostname = target.hostname;
    const answers = await resolve(hostname, { family: 4, all: true });
    const { approvedIPv4 } = assessCustomerDnsAnswers(hostname,
      answers.map(({ address, family }) => ({ name: hostname, type: family === 4 ? 'A' : 'other', address })));
    controller.signal.throwIfAborted();
    const status = await new Promise((resolveStatus, reject) => {
      const req = send(target, {
        method: 'GET',
        agent: false,
        lookup: pinnedLookup({ address: approvedIPv4[0], family: 4 }),
        servername: hostname,
        rejectUnauthorized: true,
        signal: controller.signal,
        maxHeaderSize: 16384,
        headers: { 'user-agent': 'SiteOpsIntelligence-ManualPilot/1.0' }
      }, response => {
        // Record the first response headers and close the connection.
        resolveStatus(response.statusCode);
        response.destroy();
      });
      req.on('error', reject);
      req.end();
    });
    if (!Number.isInteger(status) || status < 200 || status > 599)
      throw new Error('Pilot returned an invalid HTTP status');
    return {
      requestedUrl: target.href, finalUrl: target.href, checkedAt: new Date().toISOString(),
      status, responseTimeMs: Math.round(performance.now() - started),
      title: null, canonical: null
    };
  };

  try {
    return await Promise.race([check(), deadline]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

const sqlText = value => "'" + value.replaceAll("'", "''") + "'";

// Keep JSON quotes out of the native Windows command line.
const sqlJson = value => "CAST(X'" + Buffer.from(JSON.stringify(value), 'utf8').toString('hex') + "' AS TEXT)";

export function pilotInsert(scan, id = randomUUID(), source = 'manual') {
  if (!['manual', 'scheduled'].includes(source)) throw new Error('Invalid check source');
  if (scan.requestedUrl !== target.href || scan.finalUrl !== target.href)
    throw new Error('Pilot URL mismatch');
  const comparison = { changed: 0, critical: 0, findings: [], baseline: true };
  return [`INSERT INTO customer_scans (id,account_id,site_id,checked_at,source,result_json,comparison_json)`,
    `SELECT ${sqlText(id)},s.account_id,s.id,${sqlText(scan.checkedAt)},${sqlText(source)},${sqlJson(scan)},${sqlJson(comparison)}`,
    `FROM monitored_sites s JOIN accounts a ON a.id=s.account_id`,
    `WHERE s.account_id=${sqlText(accountId)} AND s.id=${sqlText(siteId)} AND s.url=${sqlText(target.href)}`,
    `AND s.verification_state='verified' AND a.status IN ('pilot','active')`,
    `AND NOT EXISTS (SELECT 1 FROM customer_scans WHERE id=${sqlText(id)});`,
  ].join(' ');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [output, mode, ...extra] = process.argv.slice(2);
  if (!output || (mode !== undefined && mode !== '--scheduled') || extra.length) {
    console.error('Usage: node scanner/manual-pilot-check.js <new-output.sql> [--scheduled]');
    process.exitCode = 2;
  } else {
    try {
      const scan = await checkPilot();
      const id = randomUUID();
      await writeFile(output, pilotInsert(scan, id, mode === '--scheduled' ? 'scheduled' : 'manual') + '\n', { flag: 'wx' });
      console.log(JSON.stringify({ id, ...scan }, null, 2));
    } catch (error) {
      console.error('Pilot check failed:', error.message);
      process.exitCode = 1;
    }
  }
}
