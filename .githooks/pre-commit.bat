@echo off
REM Pre-commit hook for Windows to prevent committing sensitive files
REM Install: Copy to .git/hooks/pre-commit.bat

setlocal EnableDelayedExpansion

REM Check if .env is staged
for /f "tokens=*" %%a in ('git diff --cached --name-only --diff-filter=ACM') do (
    if "%%a"==".env" (
        echo ERROR: Attempting to commit .env file
        echo This file contains secrets. If you're sure, use: git commit --no-verify
        exit /b 1
    )
)

exit /b 0
