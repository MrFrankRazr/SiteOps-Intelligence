# SiteOps Intelligence v0.3 — restricted Cloudflare test scanner

This is a **standalone backend package**. Keep your approved GitHub Pages `index.html`, `styles.css`, and sample report unchanged. Do not merge this package into the repository root: place it under `cloudflare/` when ready.

## Prerequisites
- Cloudflare account and permission to create Workers/D1
- Node 24 and npm
- Cloudflare CLI authentication (`npx wrangler login`)

## First deployment
From the folder containing this README:

1. `npm install`
2. `npm test`
3. `npx wrangler login`
4. `npx wrangler d1 create siteops-scans-test`
5. Copy the **database_id** returned by Cloudflare into `wrangler.jsonc` (replace `REPLACE_WITH_YOUR_D1_DATABASE_ID`).
6. `npx wrangler d1 migrations apply siteops-scans-test --remote`
7. `npx wrangler secret put SCAN_API_KEY` — enter a long random secret; do not add it to GitHub.
8. `npx wrangler deploy`

The Worker creates `/health` (public, returns software release only) and `/api/scan` (requires Bearer API key). The scanner accepts **only** URLs on the explicitly configured GitHub Pages test origin and path. Redirects to other destinations are rejected. There is no open user-facing scanning endpoint or public Run Scan button yet.

## Test from PowerShell
Replace the Worker URL with the actual `workers.dev` URL shown by Wrangler. Read the API key privately (never paste it into chat):

```
$workerUrl = 'https://REPLACE_WITH_WORKER.workers.dev'
$apiKey = Read-Host 'SiteOps test API key'
Invoke-RestMethod "$workerUrl/health"
Invoke-RestMethod -Uri "$workerUrl/api/scan" -Method Post -Headers @{Authorization="Bearer $apiKey"} -ContentType 'application/json' -Body '{"url":"https://mrfrankrazr.github.io/SiteOps-Intelligence/"}'
```

Run the POST twice. First call should show `baseline: true`; second call should show no changes assuming the site is unchanged. Verify database rows using `npx wrangler d1 execute siteops-scans-test --remote --command "SELECT id, website, checked_at FROM scans ORDER BY id DESC LIMIT 5"`.

## Important limitations
- This is an *authorized test-only scanner*. It intentionally does **not** accept arbitrary domains, use customer authentication, or connect to the approved static landing page.
- The API key must not be placed in browser JavaScript, HTML, the Git repository, or screenshots.
- Cloudflare's runtime differs from local Node. The v0.2 engine is not copied unchanged: v0.3 uses Worker Fetch and a fixed target allowlist.
- Test endpoint is publicly reachable at the network level, but scan operations require a secret. Review rate limits, account access, monitoring, and tenant isolation before any commercial launch.
