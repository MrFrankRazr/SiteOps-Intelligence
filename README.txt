SiteOps Intelligence v0.2.1 — DNS lookup compatibility patch

Fixes "Invalid IP address: undefined" produced by the original custom pinned-DNS callback when modern Node requests all addresses.

Instructions:
1. Extract the ZIP to a folder (for example Downloads\SiteOps-v0.2.1-Fix).
2. From PowerShell run:
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\SiteOps-v0.2.1-Fix\Apply-SiteOps-v0.2.1-Fix.ps1"
3. The script backs up and replaces scanner\engine.js and tests\engine.test.js in C:\Projects\SiteOps-Intelligence and runs npm test.
4. Then retry:
   cd C:\Projects\SiteOps-Intelligence
   node .\scanner\cli.js baseline https://mrfrankrazr.github.io/SiteOps-Intelligence/ siteops-baseline.json
   node .\scanner\cli.js compare https://mrfrankrazr.github.io/SiteOps-Intelligence/ siteops-baseline.json
5. Commit the two modified files to GitHub after validation.

No changes to public HTML/CSS, domain or Cloudflare are required.
