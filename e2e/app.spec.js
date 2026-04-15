const { test, expect } = require('@playwright/test');

async function waitForApp(page) {
  await page.goto('/');
  await page.waitForFunction(() => {
    const el = document.querySelector('#stat-count');
    return el && el.textContent !== '—';
  }, { timeout: 30000 });
}

test.describe('App startup', () => {
  test('loads and renders the map', async ({ page }) => {
    await waitForApp(page);
    const container = page.locator('#map-container');
    await expect(container).toBeVisible();
  });

  test('displays city count after data loads', async ({ page }) => {
    await waitForApp(page);
    const statCount = page.locator('#stat-count');
    const text = await statCount.innerText();
    const count = parseInt(text.replace(/,/g, ''), 10);
    expect(count).toBeGreaterThan(1000);
  });

  test('hides loading overlay after data loads', async ({ page }) => {
    await waitForApp(page);
    const loading = page.locator('#loading-overlay');
    await expect(loading).toBeHidden();
  });
});

test.describe('Map layers', () => {
  test('toggles UNESCO layer', async ({ page }) => {
    await waitForApp(page);
    const btn = page.locator('#unesco-toggle-btn');
    await expect(btn).toHaveText('Off');
    await btn.click();
    await expect(btn).toHaveText(/On|Loading/);
  });

  test('toggles Economic layer', async ({ page }) => {
    await waitForApp(page);
    const btn = page.locator('#econ-toggle-btn');
    await expect(btn).toHaveText('Economic');
    await btn.click();
    await expect(btn).toHaveText(/Off|On/);
  });

  test('opens More layers dropdown', async ({ page }) => {
    await waitForApp(page);
    const menu = page.locator('#more-layers-menu');
    await expect(menu).not.toHaveClass(/open/);
    await page.locator('#more-layers-btn').click();
    await expect(menu).toHaveClass(/open/);
    const volcanoBtn = page.locator('#volcano-toggle-btn');
    await expect(volcanoBtn).toBeVisible();
  });
});

test.describe('City search', () => {
  test('search box is visible', async ({ page }) => {
    await waitForApp(page);
    const input = page.locator('#city-search-input');
    await expect(input).toBeVisible();
  });

  test('searching for a city returns results', async ({ page }) => {
    await waitForApp(page);
    const input = page.locator('#city-search-input');
    await input.fill('Tokyo');
    await page.waitForTimeout(1000);
    const hasResults = await page.evaluate(() => {
      const lis = document.querySelectorAll('#city-search-results li');
      return lis.length > 0 && lis[0].dataset.name === 'Tokyo';
    });
    expect(hasResults).toBe(true);
  });
});

test.describe('City list panel', () => {
  test('displays cities in the list', async ({ page }) => {
    await waitForApp(page);
    const rows = page.locator('#list-panel tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10000 });
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('can sort by name', async ({ page }) => {
    await waitForApp(page);
    const sortSelect = page.locator('#f-sort');
    await sortSelect.selectOption('name-asc');
    await page.waitForTimeout(500);
    const firstCityName = await page.locator('#list-panel tbody tr td:nth-child(3)').first().innerText();
    expect(firstCityName.length).toBeGreaterThan(0);
  });

  test('can filter by minimum population', async ({ page }) => {
    await waitForApp(page);
    const popSelect = page.locator('#f-minpop');
    await popSelect.selectOption('1000000');
    await page.waitForTimeout(500);
    const countText = await page.locator('#stat-count').innerText();
    const filteredCount = parseInt(countText.replace(/,/g, ''), 10);
    expect(filteredCount).toBeGreaterThan(0);
    expect(filteredCount).toBeLessThan(14000);
  });
});

test.describe('Choropleth', () => {
  test('can toggle choropleth on', async ({ page }) => {
    await waitForApp(page);
    const btn = page.locator('#choro-toggle-btn');
    await expect(btn).toHaveText('Off');
    await btn.click();
    await expect(btn).toHaveText('On');
  });

  test('choropleth selector populates with indicators', async ({ page }) => {
    await waitForApp(page);
    await page.locator('#choro-toggle-btn').click();
    const select = page.locator('#choro-select');
    await expect(select).toBeVisible();
    const options = await select.locator('option').count();
    expect(options).toBeGreaterThan(5);
  });
});

test.describe('Theme and basemap', () => {
  test('can toggle dark/light theme', async ({ page }) => {
    await waitForApp(page);
    const html = page.locator('html');
    const initialTheme = await html.getAttribute('data-theme');
    await page.locator('#theme-toggle').click();
    const newTheme = await html.getAttribute('data-theme');
    expect(newTheme).not.toBe(initialTheme);
  });

  test('can switch basemap', async ({ page }) => {
    await waitForApp(page);
    const select = page.locator('#basemap-select');
    await select.selectOption('satellite');
    const tiles = await page.locator('.leaflet-tile-pane img').first().getAttribute('src');
    expect(tiles).toBeTruthy();
  });
});

test.describe('Keyboard shortcuts', () => {
  test('pressing Escape closes dropdown', async ({ page }) => {
    await waitForApp(page);
    await page.locator('#more-layers-btn').click();
    const menu = page.locator('#more-layers-menu');
    await expect(menu).toHaveClass(/open/);
    await page.keyboard.press('Escape');
    await expect(menu).not.toHaveClass(/open/);
  });
});

test.describe('FX sidebar', () => {
  test('can open FX sidebar', async ({ page }) => {
    await waitForApp(page);
    const fxBtn = page.locator('#fx-toggle-btn');
    if (await fxBtn.isVisible()) {
      await fxBtn.click();
      const sidebar = page.locator('#fx-sidebar');
      await expect(sidebar).toBeVisible();
    }
  });
});