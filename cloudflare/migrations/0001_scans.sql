CREATE TABLE IF NOT EXISTS scans (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 website TEXT NOT NULL,
 checked_at TEXT NOT NULL,
 result_json TEXT NOT NULL,
 comparison_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scans_website_id ON scans(website,id DESC);
