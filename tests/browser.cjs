// Optional browser integration check. Requires Playwright and Chromium.
// Start the app first with npm run dev, then run npm run test:browser.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Europe/Podgorica', acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const temp = await mkdtemp(join(tmpdir(), 'forma-check-'));
  const click = selector => page.locator(selector).first().click();
  const wait = async fn => { for (let i = 0; i < 50; i++) { if (await fn()) return; await page.waitForTimeout(100); } throw Error('Timed out waiting for expected application state'); };
  const upload = async (selector, payload) => {
    const chooser = page.waitForEvent('filechooser');
    await click(selector);
    await (await chooser).setFiles(payload);
  };
  try {
    await page.goto(process.env.FORMA_TEST_URL || 'http://127.0.0.1:3000');
    await page.waitForSelector('.demo-tag');
    assert.equal(await page.evaluate(() => localStorage.getItem('forma.workouts.v1')), null, 'demo must not seed real records');
    await click('[data-nav="exercises"]');
    const photo = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 800;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#b4c4c4'; ctx.fillRect(0, 0, 1200, 800);
      ctx.fillStyle = '#293739'; ctx.fillRect(250, 330, 650, 120); ctx.fillRect(300, 440, 45, 230); ctx.fillRect(820, 440, 45, 230);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await upload('[data-photo="bench-press"]', { name: 'moja-klupa.png', mimeType: 'image/png', buffer: Buffer.from(photo, 'base64') });
    await page.waitForSelector('.exercise-card:first-child .equipment-photo img');
    await page.reload();
    await click('[data-nav="exercises"]');
    await page.waitForSelector('.exercise-card:first-child .equipment-photo img');
    assert.equal(await page.locator('.exercise-card:first-child .equipment-photo img').evaluate(img => img.naturalWidth), 1024, 'photo should be resized and persisted');

    await click('[data-action="new-workout"]');
    await page.fill('#workout-name', 'Moj prvi trening');
    await page.fill('#workout-notes', '<b>Odličan trening</b>');
    await page.locator('[data-value="weight"]').nth(0).fill('60');
    await page.locator('[data-value="weight"]').nth(1).fill('62,5');
    await page.locator('[data-value="weight"]').nth(2).fill('65');
    await page.locator('[data-preview-photo]').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#workout-form').count(), 1, 'photo Escape should preserve workout editor');
    await click('button[form="workout-form"]');
    await page.waitForSelector('.modal', { state: 'detached' });
    assert.equal(await page.locator('.demo-tag').count(), 0, 'saving exits demo');
    let stored = await page.evaluate(() => JSON.parse(localStorage.getItem('forma.workouts.v1')));
    assert.equal(stored.length, 1); assert.equal(stored[0].exercises[0].sets[1].weight, 62.5);
    await page.reload();
    await click('[data-nav="workouts"]');
    await click('[data-workout]');
    assert.equal(await page.locator('.note-box').textContent(), '<b>Odličan trening</b>', 'notes should be text, not executable HTML');
    await click('#edit-workout');
    await page.locator('[data-value="weight"]').nth(0).fill('70');
    await click('button[form="workout-form"]');
    await page.waitForSelector('.modal', { state: 'detached' });
    await click('[data-nav="progress"]');
    assert.match(await page.locator('.records-list').innerText(), /70 kg/);
    assert.match(await page.locator('.records-list').innerText(), /1\.975 kg/);

    // Cancellation preserves entered form state.
    await click('[data-action="new-workout"]'); await page.fill('#workout-name', 'Nesačuvano');
    await page.keyboard.press('Escape'); await click('#confirm-cancel');
    assert.equal(await page.inputValue('#workout-name'), 'Nesačuvano');
    await page.keyboard.press('Escape'); await click('#confirm-ok');
    await page.waitForSelector('.modal', { state: 'detached' });

    await click('[data-nav="settings"]');
    const downloadEvent = page.waitForEvent('download'); await click('[data-action="export"]');
    const download = await downloadEvent; const path = join(temp, 'backup.json'); await download.saveAs(path);
    const backup = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(backup.workouts.length, 1); assert.ok(backup.photos['bench-press'].startsWith('data:image/jpeg;base64,'));
    // A denied workout write must not silently erase equipment photos.
    await page.evaluate(() => {
      window.originalStorageWrite = Storage.prototype.setItem;
      Storage.prototype.setItem = function () { throw new DOMException('Storage denied', 'QuotaExceededError'); };
    });
    await click('[data-action="clear"]'); await click('#confirm-ok');
    await page.waitForSelector('#confirm-error:not([hidden])');
    assert.equal(await page.evaluate(async () => Object.keys(await (await import('/src/photos.js')).getPhotos()).length), 1, 'failed clear rolls back photos');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('forma.workouts.v1')).length), 1, 'failed clear preserves workouts');
    await click('#confirm-cancel');
    await page.evaluate(() => { Storage.prototype.setItem = window.originalStorageWrite; delete window.originalStorageWrite; });
    await click('[data-action="clear"]'); await click('#confirm-ok');
    await page.waitForSelector('.modal', { state: 'detached' });
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('forma.workouts.v1')).length), 0);
    await upload('[data-action="import"]', path); await click('#confirm-ok');
    await page.waitForSelector('.modal', { state: 'detached' });
    await click('[data-nav="exercises"]'); await page.waitForSelector('.exercise-card:first-child .equipment-photo img');
    await click('[data-remove-photo="bench-press"]'); await click('#confirm-ok');
    await page.waitForSelector('.modal', { state: 'detached' });
    assert.equal(await page.locator('.equipment-photo img').count(), 0);
    await page.reload(); await click('[data-nav="exercises"]');
    assert.equal(await page.locator('.equipment-photo img').count(), 0, 'photo deletion persists');

    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
    await click('.mobile-menu'); await click('[data-nav="overview"]'); await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => [innerWidth, document.documentElement.scrollWidth]), [390, 390], 'mobile has no horizontal overflow');
    await click('[data-action="new-workout"]');
    assert.ok(await page.locator('.equipment-preview').isVisible(), 'equipment controls are visible on mobile');
    await page.keyboard.press('Escape'); await click('#confirm-ok'); await page.waitForSelector('.modal', { state: 'detached' });
    await click('.mobile-menu'); await click('[data-nav="workouts"]');
    await click('[data-workout]'); await click('#delete-workout'); await click('#confirm-ok');
    await page.waitForSelector('.modal', { state: 'detached' });
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('forma.workouts.v1')).length), 0);
    assert.equal(errors.length, 0, `Browser errors: ${errors.join(', ')}`);
    console.log('Browser integration passed: demo isolation, photos/resizing/persistence/deletion, workout CRUD, decimal weights, escaped notes, progress, modal cancellation, backup round-trip, and mobile layout.');
  } finally { await browser.close(); await rm(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
