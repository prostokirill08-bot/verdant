# Creates .env from .env.example with random secrets (ASCII-only file on purpose: Windows PowerShell 5 encoding).
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (Test-Path .env) { exit 0 }
$utf8 = New-Object System.Text.UTF8Encoding $false
$t = [IO.File]::ReadAllText((Join-Path (Get-Location) '.env.example'), $utf8)
$secret = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
$pass = [guid]::NewGuid().ToString('N').Substring(0, 20)
$t = $t -replace '(?m)^APP_SECRET=.*$', "APP_SECRET=$secret"
$t = $t -replace '(?m)^ADMIN_PASSWORD=.*$', "ADMIN_PASSWORD=$pass"
$t = $t -replace '(?m)^PUBLIC_URL=.*$', 'PUBLIC_URL=http://localhost:8000'
$t = $t -replace '(?m)^DOMAIN=.*$', 'DOMAIN=localhost'
[IO.File]::WriteAllText((Join-Path (Get-Location) '.env'), $t, $utf8)
Write-Host ".env created"
