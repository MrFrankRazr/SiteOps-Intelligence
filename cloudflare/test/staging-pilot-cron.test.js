import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { runStagingPilotCheck } from '../src/staging-pilot-cron.js';
const account = '3eed56c9-91ed-4be1-897b-ace60995635c';
const site = '658c5e7c-d5e9-46ea-8b6e-794649b74a90';
const target = 'https://siteops-test.paddockcommand.com/';
const event = { cron: '*/15 * * * *', scheduledTime: Date.now() };

test('disabled by default and ignores other schedules', async () => {
  assert.equal(await runStagingPilotCheck(event, {}), 'disabled');
  assert.equal(await runStagingPilotCheck({ ...event, cron: '* * * * *' }, { PILOT_CRON_ENABLED: 'true' }), 'disabled');
});

test('checks only the verified pilot and saves one result per slot using the outage trigger', async () => {
  using sqlite = new DatabaseSync(':memory:');
  const migrations = ['0003_customer_foundation.sql', '0005_customer_monitoring_foundation.sql',
    '0006_pilot_outage_incidents.sql'];
  for (const name of migrations)
    sqlite.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'));
  sqlite.prepare("INSERT INTO accounts (id,name) VALUES (?,'Pilot A')").run(account);
  sqlite.prepare("INSERT INTO monitored_sites (id,account_id,url) VALUES (?,?,?)").run(site, account, target);
  const env = {
    PILOT_CRON_ENABLED: 'true',
    DB: { prepare(sql) {
      const statement = sqlite.prepare(sql);
      return { bind(...args) {
        return {
          first: async () => statement.get(...args),
          run: async () => ({ success: true, meta: statement.run(...args) })
        };
      }};
    }}
  };
  let calls = 0;
  const fetchTarget = async (url, options) => {
    calls++;
    assert.equal(url, target);
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(null, { status: 503 });
  };
  assert.equal(await runStagingPilotCheck(event, env, fetchTarget), 'skipped');
  assert.equal(calls, 0);
  sqlite.exec("UPDATE monitored_sites SET verification_state='verified'");
  assert.equal(await runStagingPilotCheck(event, env, fetchTarget), 'saved');
  assert.equal(await runStagingPilotCheck(event, env, fetchTarget), 'skipped');
  assert.equal(calls, 1);
  const row = sqlite.prepare('SELECT source,result_json FROM customer_scans').get();
  assert.equal(row.source, 'scheduled');
  assert.equal(JSON.parse(row.result_json).status, 503);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM customer_outage_incidents').get().count, 1);
});
