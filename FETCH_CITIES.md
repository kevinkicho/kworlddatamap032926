# Fetch-Cities — Script Explainer

A detailed breakdown of the `scripts/fetch-cities.js` scraper script, which safely and reliably downloads thousands of global cities from Wikidata without triggering server timeout errors.

---

## Why this script exists
Wikidata limits queries to 60 seconds. If you try to ask for "every city with over 10,000 residents and all their detailed metrics," the query will inevitably timeout and crash before finishing.
To bypass this, `fetch-cities.js` breaks the request down into tiny "population tiers" and pages through them sequentially, periodically saving a physical checkpoint to your hard drive so it can safely resume if it loses network connection.

---

## How to run it

| Command | What it does |
|---|---|
| `npm run fetch-cities` | Starts fresh if no checkpoint exists; resumes from checkpoint if one does. |
| `npm run fetch-cities -- --fresh` | Forces a clean start from scratch, ignoring any existing checkpoint. |

> **Note:** The double dash `--` before `--fresh` is required by npm so the flag is passed to the script rather than consumed by npm itself.

---

## 1. Global Configuration

| Value | What it does |
|---|---|
| `LOWER_BOUND` | Set to `10,000` — cities with no population data, or population below this, are completely skipped. |
| `CORE_BATCH` | Set to `100` rows per SPARQL request. Kept intentionally small so each query finishes well within Wikidata's 60-second timeout limit, even for population tiers with tens of thousands of cities. |
| `SISTER_BATCH` | Set to `150` QIDs per chunk when fetching the nested sister-city links in Phase 2. |
| `DELAY_MS` | Set to `2,500` ms — a polite pause between every request to avoid triggering Wikidata rate limiting (HTTP 429). |
| `TIERS` | An array of 9 population brackets (≥10M down to 10k–50k). The script isolates each query to one bracket at a time, smallest-to-largest within each tier. |

---

## 2. Checkpointing System

Because fetching the entire planet meticulously takes time, the script saves its exact progress to a local, hidden file (`scripts/.checkpoint.json`).

| Function | What it does |
|---|---|
| `saveCheckpoint()` | Overwrites the checkpoint file after every completed SPARQL page (Phase 1) and after every sister-city batch (Phase 2). Stores the current `phase`, `tierIndex`, `tierOffset`, `sisterBatch`, and the complete running Map of fetched cities serialised as `[qid, record]` pairs. |
| `loadCheckpoint()` | Parses the saved file when restarting `npm run fetch-cities` to instantly recover all progress. Validates that `version === 2`; discards incompatible older formats. |
| `deleteCheckpoint()` | Cleans up the temporary checkpoint file automatically once the run completes successfully. If the script crashes, the checkpoint is preserved and the next run will resume from it. |

Checkpoint format:
```json
{
  "version": 2,
  "phase": 1,
  "tierIndex": 4,
  "tierOffset": 300,
  "sisterBatch": 0,
  "savedAt": "2025-04-01T12:34:56.000Z",
  "entries": [["Q956", { "name": "Beijing", ... }], ...]
}
```

---

## 3. Phase 1: Core City Data

Queries all available city details from Wikidata, paginated by population tier.

| Feature | How it works |
|---|---|
| `buildPopQuery()` | Builds a SPARQL SELECT with population range filters (`min`/`max`), `LIMIT 100`, and `OFFSET` for pagination. Excludes countries (Q6256), sovereign states (Q3624078), and continents (Q10864048) so only actual cities are returned. |
| The Loop | Requests 100 cities at a time. On success: merges results into the Map, saves a checkpoint, and advances the offset by 100. Stops paging when Wikidata returns fewer than 100 rows (tier exhausted). On timeout/error: logs the error and skips to the next tier — progress is not lost. |
| Result Parsing | `parseBindings()` extracts each field safely. Rows with no readable name (blank or raw Q-numbers like `Q12345`) are silently skipped. Rows with no coordinates are skipped. Value helpers: `toInt`, `toFloat`, `toYear`, `round`. |
| Deduplication | `mergeInto()` uses each city's Wikidata QID as a unique key in an ES6 `Map`. If the same city appears in multiple tiers, the highest population figure is kept and any missing fields are filled in from the duplicate row. |

### Fields fetched per city

| Field | Wikidata Property | Notes |
|---|---|---|
| `name` | `?itemLabel` | English label from Wikidata label service |
| `lat` / `lng` | P625 (coordinates) | Extracted via `geof:latitude` / `geof:longitude` |
| `pop` | P1082 | Most recent population figure available |
| `country` | P17 label | Country the city is in |
| `iso` | P17 → P297 | ISO 3166-1 alpha-2 country code (e.g. `CN`, `US`) |
| `admin` | P131 label | Administrative division (state, province, etc.) |
| `timezone` | P421 label | Timezone label |
| `area_km2` | P2046 | Total area in km² |
| `water_km2` | P2927 | Water area in km² |
| `elev_m` | P2044 | Elevation in metres above sea level |
| `founded` | P571 | Year founded (negative = BCE) |
| `website` | P856 | Official website URL |
| `geonames_id` | P1566 | GeoNames database identifier |
| `demonym` | P1549 | What residents are called (English only) |
| `gdp` | P2131 | **Nominal GDP in local currency** (e.g. renminbi for Beijing, euros for Paris). Not normalised to USD — the `iso` / `country` fields identify which currency applies. |
| `gdp_per_cap` | P2132 | GDP per capita, also in local currency |
| `hdi` | P1081 | Human Development Index (0–1 scale) |
| `pop_male` | P1540 | Male population count |
| `pop_female` | P1539 | Female population count |
| `pop_urban` | P3245 | Urban/metro population count |
| `sister_cities` | P190 (Phase 2) | Array of sister city names — filled in Phase 2 |

> **GDP note:** Earlier versions of this script used P4010 which only stored USD values and had near-zero coverage (~0%). P2131 is the correct property — it stores GDP in the city's local currency and has significantly higher coverage for large cities like Beijing, Tokyo, and Paris.

---

## 4. Phase 2: Sister Cities Enrichment

Queries the relationships between cities (e.g. "London is a sister city of Tokyo") and injects them back into the Phase 1 results.

| Feature | How it works |
|---|---|
| Why a separate phase | Including sister-city joins in Phase 1 would multiply rows per city (one row per sister), breaking deduplication and dramatically slowing every query. Keeping it isolated avoids this. |
| `buildSisterQuery()` | Uses the SPARQL `VALUES` clause to pass up to 150 specific QIDs at once and retrieve their P190 (sister city) relationships. |
| The Loop | Chunks the full `byQid` Map into batches of 150. For each batch: fetches P190 links, appends any new sister names to the city's `sister_cities` array (no duplicates), saves a checkpoint, then pauses `DELAY_MS` before the next batch. |

---

## 5. Resilient Networking & Output

| Logic Block | What it does |
|---|---|
| `sparqlFetch()` | Wraps native Node.js `fetch` with a 58-second `AbortSignal.timeout`. If Wikidata responds with HTTP 429 (rate limit) or 503 (overload), it waits `DELAY_MS × attempt × 4` seconds and retries up to 3 times before failing gracefully. |
| Error recovery | A timeout or network error on any single page logs a warning and skips the rest of that tier. Already-fetched cities are not lost — the checkpoint preserves them and the next tier starts immediately. |
| Final output | Once both phases complete: strips the internal `qid` key from every record, sorts cities from highest to lowest population, and writes the result to `public/cities-full.json`. The checkpoint is then deleted to signal a clean finish. |
| Coverage summary | Prints a table showing how many cities have each optional field populated, with percentages — useful for understanding data completeness across the dataset. |

---

## Population Tiers

The script pages through these 9 brackets in order:

| Tier | Range | Typical city count |
|---|---|---|
| 1 | ≥ 10M | ~400–500 |
| 2 | 5M – 10M | ~500–600 |
| 3 | 2M – 5M | ~1,500–2,000 |
| 4 | 1M – 2M | ~2,000–3,000 |
| 5 | 500k – 1M | ~4,000–6,000 |
| 6 | 200k – 500k | ~10,000–15,000 |
| 7 | 100k – 200k | ~10,000–15,000 |
| 8 | 50k – 100k | ~20,000+ |
| 9 | 10k – 50k | ~50,000+ |

Tiers 8 and 9 are the largest and most likely to take the most time. With `CORE_BATCH=100`, each page is fast enough to complete within Wikidata's 60-second limit. A full run covering all tiers may take 2–4 hours.
