$ErrorActionPreference = "Stop"

$backendDirectory = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $backendDirectory

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Host "FAIL: uv is not installed or is not available in PATH."
    Write-Host "Install uv, reopen PowerShell, and run this script again."
    exit 1
}

Write-Host "Preparing the project Python environment..."
uv sync --frozen
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host "Checking Supabase PostgreSQL connectivity..."
uv run python scripts/check_supabase_connection.py
exit $LASTEXITCODE
