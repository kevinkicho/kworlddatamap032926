# Security Guidelines

## API Key Management

### Current Keys (Rotate these immediately!)
The following keys are stored in `.env` and should be rotated if this repo was ever public:
- Yahoo Finance OAuth (YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET)
- FRED API Key (FRED_API_KEY)
- NOAA Token (NOAA_TOKEN)
- NASA API Keys (NASA_OPEN_API_KEY, NASA_MAP_KEY)
- WAQI Token (WAQI_TOKEN)

### How to Rotate Keys

1. **Yahoo Finance**: Go to https://developer.yahoo.com/apps/ → Find your app → Regenerate keys
2. **FRED**: Go to https://fred.stlouisfed.org/docs/api/api_key.html → Request new key
3. **NOAA**: Go to https://www.ncdc.noaa.gov/cdo-web/token → Request new token
4. **NASA**: Go to https://api.nasa.gov/ → Generate new API key
5. **WAQI**: Go to https://aqicn.org/data-platform/token/ → Request new token

### Setting Up .env

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in your actual API keys in `.env` (never commit this file!)

3. Run `setup-hooks.bat` (Windows) to install pre-commit hooks

## Pre-Commit Hooks

We use pre-commit hooks to prevent accidental commits of `.env` files.

### Install on Windows:
```bash
setup-hooks.bat
```

### Install on macOS/Linux:
```bash
cp .githooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

### Bypass (emergency only):
```bash
git commit --no-verify
```

## Content Security Policy (CSP)

The app uses a CSP meta tag to prevent XSS attacks. If you need to add new external resources:

1. Add the domain to the appropriate directive in `public/index.html`
2. Test thoroughly - CSP violations block resources

## Reporting Security Issues

If you discover a security vulnerability:
1. DO NOT open a public issue
2. Review the secret rotation steps above
3. Rotate any exposed keys immediately
