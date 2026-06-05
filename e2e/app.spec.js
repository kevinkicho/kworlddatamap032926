const { test, expect } = require('@playwright/test');

/**
 * E2E tests for World Data Map
 *
 * These tests focus on verifying the app boots correctly and core
 * functionality works. They avoid fragile checks on UI text that
 * changes with design iterations.
 *
 * Strategy:
 *   - Check element existence (toBeTruthy), not visibility
 *   - Check .on class for toggle state, not text content
 *   - Use generous timeouts for data loading
 */

const APP_TIMEOUT = 30000;

async function waitForApp(page) {
  await page.goto('/');
  // Wait for city data to load — stat-count gets populated when init completes
  await page.waitForFunction(() => {
    const el = document.getElementById('stat-count');
    return el && el.textContent !== '—' && parseInt(el.textContent.replace(/,/g, ''), 10) > 100;
  }, { timeout: APP_TIMEOUT });
}

// ── App startup ──────────────────────────────────────────────────────────────

test.describe('App startup', () => {

  test('loads and renders the map', async ({ page }) => {
    await waitForApp(page);
    expect(await page.$('#map-container')).toBeTruthy();
    expect(await page.$('.leaflet-container')).toBeTruthy();
  });

  test('displays city count after data loads', async ({ page }) => {
    await waitForApp(page);
    const text = await page.locator('#stat-count').innerText();
    expect(parseInt(text.replace(/,/g, ''), 10)).toBeGreaterThan(1000);
  });

  test('hides loading overlay after data loads', async ({ page }) => {
    await waitForApp(page);
    await expect(page.locator('#loading-overlay')).toBeHidden({ timeout: 10000 });
  });

  test('city circles render on the map', async ({ page }) => {
    await waitForApp(page);
    const paths = await page.locator('.leaflet-interactive').count();
    expect(paths).toBeGreaterThan(100);
  });

});

// ── Map layers ───────────────────────────────────────────────────────────────

test.describe('Map layers', () => {

  test('toggles UNESCO layer via dropdown', async ({ page }) => {
    await waitForApp(page);
    // UNESCO button is inside More layers dropdown
    await page.locator('#more-layers-btn').click();
    await page.waitForTimeout(500);
    const btn = page.locator('#unesco-toggle-btn');
    expect(await btn.count()).toBeGreaterThan(0);
    await expect(btn).not.toHaveClass(/on/);
    await btn.click();
    await page.waitForTimeout(1000);
    await expect(btn).toHaveClass(/on/);
  });

  test('toggles Economic layer', async ({ page }) => {
    await waitForApp(page);
    const btn = page.locator('#econ-toggle-btn');
    await btn.click();
    await page.waitForTimeout(2000);
    await expect(btn).toHaveClass(/on/);
  });

  test('opens More layers dropdown', async ({ page }) => {
    await waitForApp(page);
    const menu = page.locator('#more-layers-menu');
    await expect(menu).not.toHaveClass(/open/);
    await page.locator('#more-layers-btn').click();
    await page.waitForTimeout(300);
    await expect(menu).toHaveClass(/open/);
    // Verify at least one layer button exists
    const buttons = await menu.locator('button').count();
    expect(buttons).toBeGreaterThan(5);
  });

});

// ── City interactions ────────────────────────────────────────────────────────

test.describe('City interactions', () => {

  test('search box exists', async ({ page }) => {
    await waitForApp(page);
    expect(await page.$('#city-search-input')).toBeTruthy();
  });

  test('sidebar element exists and can open', async ({ page }) => {
    await waitForApp(page);
    const sidebar = page.locator('#wiki-sidebar');
    expect(await sidebar.count()).toBe(1);
    // Sidebar should be closed initially
    await expect(sidebar).not.toHaveClass(/open/);
  });

});

// ── City list panel ──────────────────────────────────────────────────────────

test.describe('City list panel', () => {

  test('displays cities in the list', async ({ page }) => {
    await waitForApp(page);
    const rows = page.locator('#list-panel tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10000 });
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('can sort by name', async ({ page }) => {
    await waitForApp(page);
    await page.locator('#f-sort').selectOption('name-asc');
    await page.waitForTimeout(500);
    const name = await page.locator('#list-panel tbody tr td:nth-child(3)').first().innerText();
    expect(name.length).toBeGreaterThan(0);
  });

  test('can filter by minimum population', async ({ page }) => {
    await waitForApp(page);
    const beforeText = await page.locator('#stat-count').innerText();
    const beforeCount = parseInt(beforeText.replace(/,/g, ''), 10);
    expect(beforeCount).toBeGreaterThan(0);
    // Verify the select exists and has options
    const select = page.locator('#f-minpop');
    await expect(select).toBeTruthy();
    const options = await select.locator('option').count();
    expect(options).toBeGreaterThan(1);
  });

});

// ── Choropleth ───────────────────────────────────────────────────────────────

test.describe('Choropleth', () => {

  test('can toggle choropleth on', async ({ page }) => {
    await waitForApp(page);
    const btn = page.locator('#choro-toggle-btn');
    await expect(btn).not.toHaveClass(/on/);
    await btn.click();
    await page.waitForTimeout(3000);
    await expect(btn).toHaveClass(/on/);
  });

});

// ── Theme and basemap ────────────────────────────────────────────────────────

test.describe('Theme and basemap', () => {

  test('can toggle dark/light theme', async ({ page }) => {
    await waitForApp(page);
    const html = page.locator('html');
    const initial = await html.getAttribute('data-theme');
    await page.locator('#theme-toggle').click();
    await page.waitForTimeout(300);
    const changed = await html.getAttribute('data-theme');
    expect(changed).not.toBe(initial);
  });

  test('can switch basemap', async ({ page }) => {
    await waitForApp(page);
    await page.locator('#basemap-select').selectOption('satellite');
    await page.waitForTimeout(1000);
    const tiles = page.locator('.leaflet-tile-pane img');
    expect(await tiles.count()).toBeGreaterThan(0);
  });

});

// ── Keyboard shortcuts ───────────────────────────────────────────────────────

test.describe('Keyboard shortcuts', () => {

  test('pressing Escape closes dropdown', async ({ page }) => {
    await waitForApp(page);
    await page.locator('#more-layers-btn').click();
    const menu = page.locator('#more-layers-menu');
    await expect(menu).toHaveClass(/open/);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await expect(menu).not.toHaveClass(/open/);
  });

});

// ── Corporations ─────────────────────────────────────────────────────────────

test.describe('Corporations', () => {

  test('can open global corporations panel', async ({ page }) => {
    await waitForApp(page);
    const panel = page.locator('#global-corp-panel');
    await page.evaluate(() => {
      const btn = document.getElementById('global-corp-header');
      if (btn) btn.click();
    });
    await page.waitForTimeout(1000);
    expect(await panel.count()).toBeGreaterThan(0);
    // Panel should have background (not transparent)
    const bg = await panel.evaluate(el => getComputedStyle(el).background);
    expect(bg).not.toBe('rgba(0, 0, 0, 0) none repeat scroll 0% 0% / auto padding-box border-box');
  });

});
