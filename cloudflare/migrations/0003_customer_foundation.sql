-- SiteOps v0.6.1: additive account and ownership foundations.
-- Existing scans/reports remain attached to internal pilot and are not re-assigned.
CREATE TABLE IF NOT EXISTS accounts (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pilot' CHECK (status IN ('pilot','active','suspended')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS account_members (
 account_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK (role IN ('owner','admin','viewer')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(account_id,user_id),
 FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS account_users (
 id TEXT PRIMARY KEY,
 email_normalized TEXT NOT NULL UNIQUE,
 identity_provider TEXT NOT NULL,
 provider_subject TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(identity_provider,provider_subject)
);
CREATE TABLE IF NOT EXISTS monitored_sites (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL,
 url TEXT NOT NULL,
 verification_state TEXT NOT NULL DEFAULT 'pending' CHECK (verification_state IN ('pending','verified','revoked')),
 verification_token_hash TEXT,
 verified_at TEXT,
 monitoring_enabled INTEGER NOT NULL DEFAULT 0 CHECK(monitoring_enabled IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(account_id,url),
 FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_monitored_sites_account ON monitored_sites(account_id,id);
CREATE INDEX IF NOT EXISTS idx_monitored_sites_schedule ON monitored_sites(monitoring_enabled,verification_state);
-- Keep v0.5 scan/report tables untouched until v0.6.2 migrates them with tenant-aware reads.
