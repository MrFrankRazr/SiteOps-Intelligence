-- Invite-only opaque customer access tokens. Store hashes, never plaintext credentials.
CREATE TABLE IF NOT EXISTS customer_access_tokens (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE,
 expires_at TEXT NOT NULL,
 revoked_at TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_customer_access_user ON customer_access_tokens(user_id);
