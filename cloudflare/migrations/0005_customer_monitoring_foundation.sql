-- SiteOps v0.7.0: isolated customer scan/report records. Additive, staging first.
-- No customer monitoring is enabled by this migration.
CREATE UNIQUE INDEX IF NOT EXISTS idx_monitored_sites_account_id ON monitored_sites(account_id,id);

CREATE TABLE IF NOT EXISTS customer_scans (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual','scheduled')),
  result_json TEXT NOT NULL,
  comparison_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (account_id,site_id) REFERENCES monitored_sites(account_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_scans_scope_id ON customer_scans(account_id,site_id,id);
CREATE INDEX IF NOT EXISTS idx_customer_scans_scope_time ON customer_scans(account_id,site_id,checked_at DESC);

CREATE TABLE IF NOT EXISTS customer_reports (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  scan_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  report_json TEXT NOT NULL,
  FOREIGN KEY (account_id,site_id,scan_id) REFERENCES customer_scans(account_id,site_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_customer_reports_scope_time ON customer_reports(account_id,site_id,created_at DESC);
