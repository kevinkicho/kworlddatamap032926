@echo off
REM Setup script to configure pre-commit hooks on Windows

echo Setting up git hooks...

if not exist .git\hooks mkdir .git\hooks 2>nul

copy /Y .githooks\pre-commit.bat .git\hooks\pre-commit.bat > nul

echo Pre-commit hook installed!
echo The hook will prevent committing .env files.
echo.
echo To bypass the hook in an emergency, use: git commit --no-verify
pause
