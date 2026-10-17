CREATE TABLE IF NOT EXISTS reports (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 scan_id INTEGER NOT NULL UNIQUE,
 website TEXT NOT NULL,
 created_at TEXT NOT NULL,
 source TEXT NOT NULL CHECK (source IN ('manual','scheduled')),
 report_json TEXT NOT NULL,
 FOREIGN KEY (scan_id) REFERENCES scans(id)
);
CREATE INDEX IF NOT EXISTS idx_reports_website_id ON reports(website,id DESC);
