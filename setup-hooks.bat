@echo off
REM Setup script to configure pre-commit hooks on Windows
REM
REM Two installation methods (both are applied):
REM   1. git config core.hooksPath .githooks  (preferred - uses .githooks/ directly)
REM   2. Copy .bat hook to .git/hooks/pre-commit (fallback - no extension!)

echo Setting up git hooks...

REM Method 1: Configure Git to use .githooks directory (preferred)
git config core.hooksPath .githooks
if %errorlevel% neq 0 (
    echo WARNING: git config core.hooksPath failed. Trying fallback...
    goto :fallback
)
echo [OK] Configured core.hooksPath to .githooks

REM Method 2: Also install as fallback (in case hooksPath is reset)
:fallback
if not exist .git\hooks mkdir .git\hooks 2>nul

REM CRITICAL: Git expects "pre-commit" with NO extension, even on Windows
copy /Y .githooks\pre-commit.bat .git\hooks\pre-commit > nul
if %errorlevel% neq 0 (
    echo WARNING: Failed to copy pre-commit hook to .git\hooks\
    goto :done
)
echo [OK] Copied pre-commit hook to .git\hooks\pre-commit

:done
echo.
echo Pre-commit hook installed! Protected files:
echo   .env, .env.local, .env.*, credentials.json, secrets.json, *.pem, *.key
echo.
echo To bypass the hook in an emergency, use: git commit --no-verify
pause