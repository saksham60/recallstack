@echo off
setlocal
cd /d "%~dp0.."

where uv >nul 2>nul
if errorlevel 1 (
  echo FAIL: uv is not installed or is not available in PATH.
  exit /b 1
)

echo Preparing the project Python environment...
uv sync --frozen
if errorlevel 1 exit /b %errorlevel%

echo Checking Supabase PostgreSQL connectivity...
uv run python scripts\check_supabase_connection.py
exit /b %errorlevel%
