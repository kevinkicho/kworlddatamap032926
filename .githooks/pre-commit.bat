@echo off
REM Pre-commit hook for Windows to prevent committing sensitive files
REM Install: run setup-hooks.bat

setlocal EnableDelayedExpansion

set "FOUND=0"

for /f "tokens=*" %%a in ('git diff --cached --name-only --diff-filter=ACM') do (
    set "FILE=%%a"
    REM Check .env (root or any subdirectory)
    for %%b in ("%%a") do set "BASENAME=%%~nxb"
    if "!BASENAME!"==".env" set "FOUND=1"
    if "!BASENAME!"==".env.local" set "FOUND=1"
    echo "!FILE!" | findstr /R /C:"^\.env\." >nul 2>&1 && set "FOUND=1"
    REM Check other forbidden files
    if "!BASENAME!"=="credentials.json" set "FOUND=1"
    if "!BASENAME!"=="secrets.json" set "FOUND=1"
    echo "!FILE!" | findstr /R /C:"\.pem$" >nul 2>&1 && set "FOUND=1"
    echo "!FILE!" | findstr /R /C:"\.key$" >nul 2>&1 && set "FOUND=1"
)

if "!FOUND!"=="1" (
    echo ERROR: Attempting to commit a forbidden file ^(.env, credentials.json, secrets.json, *.pem, *.key^)
    echo This file may contain secrets. If you're sure, use: git commit --no-verify
    exit /b 1
)

exit /b 0