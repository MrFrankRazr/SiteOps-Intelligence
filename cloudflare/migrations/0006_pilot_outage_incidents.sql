CREATE TABLE IF NOT EXISTS customer_outage_incidents (
  account_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  opened_scan_id TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  http_status INTEGER NOT NULL,
  closed_at TEXT,
  PRIMARY KEY (account_id, site_id, opened_scan_id),
  FOREIGN KEY (account_id, site_id) REFERENCES monitored_sites(account_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_outage_open
  ON customer_outage_incidents(account_id, site_id) WHERE closed_at IS NULL;

CREATE TRIGGER IF NOT EXISTS track_staging_pilot_outage
AFTER INSERT ON customer_scans
WHEN NEW.source = 'scheduled'
  AND NEW.account_id = '3eed56c9-91ed-4be1-897b-ace60995635c'
  AND NEW.site_id = '658c5e7c-d5e9-46ea-8b6e-794649b74a90'
  AND json_valid(NEW.result_json)
BEGIN
  INSERT INTO customer_outage_incidents
    (account_id, site_id, opened_scan_id, opened_at, http_status)
  SELECT NEW.account_id, NEW.site_id, NEW.id, NEW.checked_at, json_extract(NEW.result_json, '$.status')
  WHERE json_extract(NEW.result_json, '$.status') BETWEEN 500 AND 599
    AND NOT EXISTS (
      SELECT 1 FROM customer_scans
      WHERE account_id = NEW.account_id AND site_id = NEW.site_id
        AND source = 'scheduled' AND checked_at > NEW.checked_at
    )
  ON CONFLICT DO NOTHING;

  UPDATE customer_outage_incidents SET closed_at = NEW.checked_at
  WHERE account_id = NEW.account_id AND site_id = NEW.site_id
    AND closed_at IS NULL AND opened_at <= NEW.checked_at
    AND json_extract(NEW.result_json, '$.status') BETWEEN 200 AND 299
    AND NOT EXISTS (
      SELECT 1 FROM customer_scans
      WHERE account_id = NEW.account_id AND site_id = NEW.site_id
        AND source = 'scheduled' AND checked_at > NEW.checked_at
    );
END;
