$ErrorActionPreference = 'Stop'
$project = 'C:\Projects\SiteOps-Intelligence'
$source = $PSScriptRoot
if (!(Test-Path -LiteralPath (Join-Path $project 'package.json'))) { throw "Project not found at $project" }
foreach ($relative in @('scanner\engine.js', 'tests\engine.test.js')) {
  $src = Join-Path $source $relative
  $dst = Join-Path $project $relative
  if (!(Test-Path -LiteralPath $src)) { throw "Missing patch file: $src" }
  if (!(Test-Path -LiteralPath (Split-Path $dst -Parent))) { throw "Expected project folder missing: $(Split-Path $dst -Parent)" }
  if (Test-Path -LiteralPath $dst) { Copy-Item -LiteralPath $dst -Destination "$dst.bak-v0.2" -Force }
  Copy-Item -LiteralPath $src -Destination $dst -Force
  Write-Host "Updated $relative"
}
Push-Location $project
try {
  npm test
  if ($LASTEXITCODE -ne 0) { throw 'npm test failed' }
} finally { Pop-Location }
Write-Host 'v0.2.1 patch applied and tests passed.'
