# SiteOps Intelligence — Approved Draft + Scan Prototype v0.2

## Current state

- `index.html`, `styles.css`, and `sample-report.*` preserve the approved static preview.
- `scanner/` contains a **developer-only command-line prototype** that fetches a public website, records basic HTTP/metadata baselines and compares rescans.
- There is **no** public scan API, live monitoring service, customer login, email delivery, payment processing or real report generation yet.
- Do not put personal, private or production secrets in the repository. Do not present the sample PDF as a real assessment.

## GitHub upload

Upload the contents of this ZIP into your dedicated `SiteOps-Intelligence` repository, preserving paths. Existing site files do not need visual changes. GitHub Pages still serves `index.html` from the repository root. The `scanner/` code **does not execute on GitHub Pages**.

## Prototype test (local workstation with Node.js 20+)

```sh
npm test
node scanner/cli.js baseline https://example.com baseline.json
node scanner/cli.js compare https://example.com baseline.json
```

The baseline file is intentionally create-only to avoid accidental overwrites. The comparison prints JSON showing changed fields. Run only against sites you own or are authorized to assess; do not conduct broad scanning.

## Security and limitations

The prototype checks DNS records for non-public addresses, then pins the connection to the validated address. It disallows IP literal URLs, nonstandard ports and credentials; checks every redirect destination; sets a timeout and response-size cap. This is **not a production security audit** and must not be exposed as a public URL-scanning endpoint without dedicated SSRF/security review, rate limiting, authorization, abuse controls and logging. DNS and IP-range coverage should be hardened before deployment.

HTML extraction uses deliberately simple pattern matching and is insufficient for arbitrary websites. It currently checks **only one URL per invocation** and does not validate links or produce live PDFs. A metadata change is marked for review, not automatically classified as a defect.

## Next milestones

1. Validate sample report and scan results against an authorized test site.
2. Add a bounded multi-page scan with explicit URL ownership confirmation and stronger HTML parsing.
3. Implement Cloudflare Worker API, D1 snapshot schema, and customer authentication.
4. Generate live PDF reports and build subscriptions only after paid demand validation.
