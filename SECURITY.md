# Security Guidelines

## API Key Management

### Current Keys (Rotate if exposed)
The following keys are stored in `.env` and should be rotated if this repo is exposed:
- Yahoo Finance OAuth (YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET)
- FRED API Key (FRED_API_KEY)
- NOAA Token (NOAA_TOKEN)
- NASA API Keys (NASA_OPEN_API_KEY, NASA_MAP_KEY)
- BEA API Key (BEA_API_KEY)
- WAQI Token (WAQI_TOKEN)

### How to Rotate Keys
1. **Yahoo Finance**: https://developer.yahoo.com/apps/ → Find your app → Regenerate keys
2. **FRED**: https://fred.stlouisfed.org/docs/api/api_key.html → Request new key
3. **NOAA**: https://www.ncdc.noaa.gov/cdo-web/token → Request new token
4. **NASA**: https://api.nasa.gov/ → Generate new API key
5. **BEA**: https://apps.bea.gov/api/signup/ → Request new key
6. **WAQI**: https://aqicn.org/data-platform/token/ → Request new token

### Setting Up .env
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Fill in your actual API keys in `.env` (never commit this file)
3. `.env` is in `.gitignore` and protected by pre-commit hooks

### Pre-Commit Hooks
```bash
# Windows:
setup-hooks.bat

# macOS/Linux:
cp .githooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

## Security Status (Updated 2026-06-05)

| Issue | Status |
|---|---|
| XSS in GTD/UNESCO/trade onclick | Fixed |
| XSS in showModal() panel-utils | Fixed |
| ISS tracker http:// → https:// | Fixed |
| .env in .gitignore | Confirmed |
| Write race on /api/enrich | Fixed (serialized) |
| safeOnclick quote collision | Fixed (single-quote delimiter) |
| `innerHTML` usage (77 instances) | Monitored — all use escHtml() |

## Reporting Security Issues

1. DO NOT open a public issue
2. Review the secret rotation steps above
3. Rotate any exposed keys immediately
