import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Observe the real Cesium viewer without adding production debugging globals.
  await page.route('**/src/globe.js', async route => {
    const response = await route.fetch();
    const script = await response.text();
    await route.fulfill({ response, body:script.replace('const scene = viewer.scene;', 'window.__testViewer = viewer; const scene = viewer.scene;') });
  });
  await page.route('**/w/api.php?**', route => {
    const params = new URL(route.request().url()).searchParams;
    const data = params.has('list') ? { query:{ geosearch:[{ pageid:1,dist:125 }] } } : { query:{ pages:{ 1:{ title:'История тестового места',extract:'Интересная история выбранного места.',fullurl:'https://ru.wikipedia.org/wiki/Test' } } } };
    return route.fulfill({ json:data });
  });
  await page.route('**/v1/forecast?**', route => route.fulfill({ json:{ timezone:'Asia/Tokyo',current:{ temperature_2m:21,weather_code:0 } } }));
  await page.route('**/v1/search?**', route => route.fulfill({ json:{ results:[{ name:'Киото',latitude:35.0116,longitude:135.7681,country:'Япония' }] } }));
});

async function ready(page) {
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#exploreButton')).toBeEnabled();
}

test('real globe rests when idle and responds to quality, light and rotation controls', async ({ page }) => {
  const errors = []; page.on('pageerror',e => errors.push(e.message));
  await ready(page);
  const settings = await page.evaluate(() => {
    const v = window.__testViewer;
    window.__frames = 0; v.scene.postRender.addEventListener(() => window.__frames++);
    return { requestRender:v.scene.requestRenderMode,timeChange:v.scene.maximumRenderTimeChange,scale:v.resolutionScale,fps:v.targetFrameRate,fxaa:v.scene.postProcessStages.fxaa.enabled };
  });
  expect(settings).toEqual({ requestRender:true,timeChange:Infinity,scale:1,fps:30,fxaa:false });
  await page.waitForTimeout(10000);
  await page.evaluate(() => { window.__frames = 0; });
  await page.waitForTimeout(2000);
  const idleFrames = await page.evaluate(() => window.__frames);
  expect(idleFrames).toBeLessThan(12);
  await page.locator('#qualityButton').click();
  await expect(page.locator('#qualityButton')).toHaveAttribute('aria-pressed','false');
  await page.locator('#lightButton').click();
  await expect(page.locator('#lightButton')).toHaveAttribute('aria-pressed','false');
  await page.locator('#rotateButton').click();
  await page.evaluate(() => { window.__frames = 0; });
  await page.waitForTimeout(1200);
  // SwiftShader software rendering can be slower than a physical GPU.
  expect(await page.evaluate(() => window.__frames)).toBeGreaterThan(2);
  await page.locator('#rotateButton').click();
  await expect(page.locator('#rotateButton')).toHaveAttribute('aria-pressed','false');
  await page.evaluate(() => {
    Object.defineProperty(document,'hidden',{ configurable:true,get:() => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(() => window.__testViewer.useDefaultRenderLoop)).toBe(false);
  await page.evaluate(() => {
    delete document.hidden; document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(() => window.__testViewer.useDefaultRenderLoop)).toBe(true);
  await page.screenshot({ path:'test-results/terra-desktop.png' });
  expect(errors).toEqual([]);
  console.log(`Idle render count in 2 seconds: ${idleFrames}`);
});

test('collections, saving and passport survive reload without double-counting', async ({ page }) => {
  await page.emulateMedia({ reducedMotion:'reduce' });
  await ready(page);
  await page.locator('#collectionsButton').click();
  await page.locator('#collectionTabs button').nth(1).click();
  await page.locator('#collectionList button').first().click();
  await expect(page.locator('#placeTitle')).toHaveText('Киото, Япония');
  await expect(page.locator('#weatherValue')).toHaveText('21°C');
  await expect(page.locator('#passportCount')).toHaveText('1');
  await page.locator('#saveButton').click();
  await expect(page.locator('#saveButton')).toHaveText('♥ Сохранено');
  await page.reload(); await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#savedButton').click();
  await page.locator('#savedList .result').click();
  await expect(page.locator('#placeTitle')).toHaveText('Киото, Япония');
  await expect(page.locator('#passportCount')).toHaveText('1');
  await page.locator('#closeInfo').click(); await page.locator('#passportButton').click();
  await expect(page.locator('#visitedCount')).toHaveText('1');
  await expect(page.locator('#savedCount')).toHaveText('1');
  await expect(page.locator('.badge.unlocked')).toHaveCount(1);
});

test('city search, shared coordinates and unavailable APIs have useful fallbacks', async ({ page }) => {
  await page.emulateMedia({ reducedMotion:'reduce' });
  await ready(page);
  await page.locator('#searchInput').fill('Киото'); await page.locator('#searchButton').click();
  await page.locator('#searchResults button').click();
  await expect(page.locator('#info')).toBeVisible();
  await page.route('**/w/api.php?**', route => route.fulfill({ status:503,body:'Unavailable' }));
  await page.route('**/v1/forecast?**', route => route.fulfill({ status:503,body:'Unavailable' }));
  await page.goto('./#lat=-12.345&lon=40.123');
  await expect(page.locator('#info')).toBeVisible();
  await expect(page.locator('#weatherValue')).toHaveText('—');
  await expect(page.locator('#localTime')).toContainText('≈');
  await expect(page.locator('#placeDescription')).toContainText('Википедия сейчас недоступна');
});

test('mobile layout, logos and Pages subpath assets are usable', async ({ page, request }) => {
  await page.setViewportSize({ width:390,height:844 });
  await page.emulateMedia({ reducedMotion:'reduce' });
  await ready(page);
  for (const asset of ['assets/logo.svg','assets/apple-touch-icon.png','assets/icon-192.png','assets/icon-512.png','site.webmanifest']) {
    expect((await request.get(asset)).ok()).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#themeButton').click();
  await page.waitForTimeout(4000);
  const credits = await page.locator('.cesium-viewer-bottom').boundingBox();
  expect(credits.y).toBeGreaterThan(800);
  await page.screenshot({ path:'test-results/terra-mobile.png' });
  await page.locator('#dailyButton').click();
  await expect(page.locator('#info')).toBeVisible();
  await expect(page.locator('#curatedNote')).toBeVisible();
  await page.locator('#closeInfo').click();
  await expect(page.locator('#collectionsButton')).toBeVisible();
});

test('configured sponsor displays a compact labelled HTTPS link', async ({ page }) => {
  await page.route('**/src/config.js', async route => {
    const response = await route.fetch();
    const script = (await response.text()).replace('enabled: false','enabled: true').replace("url: ''", "url: 'https://example.org/travel'");
    await route.fulfill({ response,body:script });
  });
  await ready(page);
  await expect(page.locator('#sponsor')).toBeVisible();
  await expect(page.locator('#sponsorLink')).toHaveAttribute('rel','sponsored noopener noreferrer');
  await expect(page.locator('#sponsorLink')).toHaveAttribute('href','https://example.org/travel');
  await page.setViewportSize({ width:390,height:844 });
  await expect(page.locator('#sponsorLink')).toBeInViewport();
});
