$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$state = Join-Path $env:LOCALAPPDATA 'SiteOps-PhaseM'
New-Item -ItemType Directory -Path $state -Force | Out-Null
$run = Join-Path $state ([Guid]::NewGuid().ToString())
$sqlFile = "$run.sql"
$log = "$run.log"
$db = 'a6893a39-5ee0-4c4f-ae68-b0c5d0e721bc'

try {
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $npx = (Get-Command npx.cmd -ErrorAction Stop).Source
    Push-Location $project
    try {
        & $node (Join-Path $PSScriptRoot 'manual-pilot-check.js') $sqlFile --scheduled >> $log
        if ($LASTEXITCODE -ne 0) { throw 'The pilot HTTPS measurement failed.' }

        Set-Location (Join-Path $project 'cloudflare')
        $sql = (Get-Content -LiteralPath $sqlFile -Raw).Trim()
        if ($sql -match '[\r\n"]') { throw 'Install the packaged checker before running this task.' }
        $output = & $npx --no-install wrangler d1 execute $db --remote --config wrangler.staging.jsonc --command $sql --json
        $code = $LASTEXITCODE
        $output | Add-Content -LiteralPath $log
        if ($code -ne 0) { throw 'Staging D1 import failed.' }
        $result = @(($output -join [Environment]::NewLine) | ConvertFrom-Json -ErrorAction Stop)
        if ($result.Count -ne 1 -or $result[0].success -ne $true -or $result[0].meta.changes -ne 1) {
            throw 'D1 did not confirm insertion of one scheduled scan.'
        }
        Add-Content -LiteralPath $log -Value 'PASS: One scheduled scan was saved.'
    } finally {
        Pop-Location
    }
} catch {
    Add-Content -LiteralPath $log -Value ("FAIL: " + $_.Exception.Message)
    if (Test-Path -LiteralPath $sqlFile) {
        Add-Content -LiteralPath $log -Value "Saved SQL for retry: $sqlFile"
    }
    exit 1
}
