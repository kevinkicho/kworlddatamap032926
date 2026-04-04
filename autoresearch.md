# Autoresearch: Optimize Test Suite Runtime

## Objective
Minimize the wall-clock time for `npm test` (node --test runner, 95 tests across 21 suites in tests/*.test.js).

## Baseline
- **Command:** `npm test` → `node --test tests/*.test.js`
- **Baseline runtime:** ~157ms (duration_ms reported by node:test)
- **All 95 tests must pass** — no regressions allowed.

## Constraints
- All 95 tests must continue to pass.
- Do NOT change what the tests assert — only how they run.
- Do NOT simplify or remove tests to gain speed.
- The pure-utils.cjs module must stay in sync with app.js functions.
- No external test framework dependencies (keep zero devDependencies for tests).
- Node.js built-in modules only (node:test, node:assert, node:worker_threads, etc.).

## Metric
Primary: `duration_ms` from the final line of `npm test` output.
Secondary: wall-clock time (`Bash time npm test`).

## What to try
- Worker threads / parallel test file execution (node --test supports --test-concurrency)
- Splitting tests into multiple files run in parallel
- Reducing per-test overhead (require caching, setup cost)
- node:test flags (--test-timeout, --experimental-test-isolation)
- Reducing cold-start cost of the CJS module
- Any other Node.js test runner optimizations

## What NOT to try
- Switching to a different test framework (vitest, jest, mocha)
- Removing or skipping tests
- Mocking the pure-utils module to make tests trivially fast
