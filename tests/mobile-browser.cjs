// Touch-layout regression checks. Start npm run dev, then run this script.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const origin = process.env.FORMA_TEST_URL || 'http://127.0.0.1:3000';
const viewports = [
  { width: 320, height: 740 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 844, height: 390 },
];
const views = ['overview', 'workouts', 'progress', 'exercises', 'settings'];

async function noOverflow(page, context) {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(dimensions.document <= dimensions.viewport + 1,
    `${context}: document width ${dimensions.document} exceeds viewport ${dimensions.viewport}`);
  assert.ok(dimensions.body <= dimensions.viewport + 1,
    `${context}: body width ${dimensions.body} exceeds viewport ${dimensions.viewport}`);
}

async function accessibleControlSizes(page, context) {
  const invalid = await page.evaluate(() => [...document.querySelectorAll(
    '.mobile-nav-button, .heading-actions .button, .topbar .icon-button, .period-tabs button, '
    + '.photo-upload, .photo-delete, .exercise-card-heading .icon-button, .row-open, '
    + '.entry-head .icon-button, .add-set, .set-remove, .modal-footer .button',
  )].flatMap(element => {
    const box = element.getBoundingClientRect();
    if (!box.width || !box.height || getComputedStyle(element).visibility === 'hidden') return [];
    return box.width < 43.5 || box.height < 43.5
      ? [{ name: element.getAttribute('aria-label') || element.textContent.trim(), width: box.width, height: box.height }]
      : [];
  }));
  assert.deepEqual(invalid, [], `${context}: touch controls must be at least 44 × 44 CSS pixels`);
  const smallInputs = await page.evaluate(() => [...document.querySelectorAll('input, select, textarea')]
    .filter(element => element.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(element).fontSize) < 16)
    .map(element => ({ id: element.id, font: getComputedStyle(element).fontSize })));
  assert.deepEqual(smallInputs, [], `${context}: form controls need 16px text to avoid iOS focus zoom`);
}

async function mobileNav(page, view) {
  await page.locator(`.mobile-nav [data-nav="${view}"]`).tap();
  assert.equal(await page.locator('.mobile-nav [aria-current="page"]').count(), 1);
  assert.equal(await page.locator('.mobile-nav [aria-current="page"]').getAttribute('data-nav'), view);
}

async function expectVisibleModalFooter(page, context) {
  await page.waitForFunction(() => {
    const height = parseFloat(document.documentElement.style.getPropertyValue('--app-height'));
    return Math.abs(height - (visualViewport?.height || innerHeight)) < 1;
  });
  const dimensions = await page.evaluate(() => {
    const modal = document.querySelector('.modal').getBoundingClientRect();
    const footer = document.querySelector('.modal-footer').getBoundingClientRect();
    const body = document.querySelector('.modal-body');
    return {
      width: innerWidth, height: visualViewport?.height || innerHeight,
      modal: { x: modal.x, y: modal.y, width: modal.width, height: modal.height },
      footer: { top: footer.top, bottom: footer.bottom },
      body: { client: body.clientHeight, scroll: body.scrollHeight },
    };
  });
  assert.ok(Math.abs(dimensions.modal.width - dimensions.width) < 1, `${context}: logger fills the screen width`);
  assert.ok(dimensions.footer.top >= 0 && dimensions.footer.bottom <= dimensions.height + 1,
    `${context}: save/cancel footer remains inside the visible viewport`);
  assert.ok(dimensions.body.client > 0 && dimensions.body.scroll > dimensions.body.client,
    `${context}: modal body remains independently scrollable`);
  const moved = await page.locator('.modal-body').evaluate(element => { element.scrollTop = 100; return element.scrollTop; });
  assert.ok(moved > 0, `${context}: form can scroll without moving its footer`);
  await noOverflow(page, context);
  await accessibleControlSizes(page, context);
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(origin);
        await page.waitForSelector('.mobile-nav');
        assert.equal(await page.locator('.mobile-nav button').count(), 5);
        assert.equal(await page.locator('.sidebar').isVisible(), false, 'desktop sidebar is hidden');
        assert.equal(await page.evaluate(() => {
          const control = document.querySelector('.sidebar [data-nav]');
          control.focus();
          return document.activeElement === control;
        }), false, 'hidden desktop controls cannot receive focus');
        for (const view of views) {
          await mobileNav(page, view);
          await noOverflow(page, `${viewport.width}×${viewport.height} ${view}`);
          await accessibleControlSizes(page, `${viewport.width}×${viewport.height} ${view}`);
          if (view === 'progress') {
            assert.ok(await page.locator('.progress-table [data-label="Serije"]').first().isVisible(),
              'series metric stays visible in mobile progress cards');
            assert.equal(await page.locator('.progress-table [data-label="Serije"]').first().innerText(), '3');
            await page.locator('[data-chart-point]').first().tap();
            const caption = await page.locator('.chart-point-detail').innerText();
            assert.match(caption, /kg/);
            assert.ok(!caption.includes('izaberi tačku'), 'tapping chart shows the selected session');
          }
        }
        await mobileNav(page, 'overview');
        await page.locator('.heading-actions [data-action="new-workout"]').tap();
        await expectVisibleModalFooter(page, `${viewport.width}×${viewport.height} workout`);
        if (viewport.width === 320) {
          for (const height of [500, 340]) {
            await page.setViewportSize({ width: 320, height });
            await expectVisibleModalFooter(page, `320×${height} keyboard-height simulation`);
          }
        }
        assert.deepEqual(errors, [], `${viewport.width}×${viewport.height}: no browser errors`);
        console.log(`Mobile layout passed: ${viewport.width}×${viewport.height}, five views, navigation, touch controls, chart and logger.`);
      } finally { await context.close(); }
    }

    // Complete a touch-only workout with a custom machine and photo in a fresh profile.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(origin);
      await page.waitForSelector('.mobile-nav');
      await page.locator('.heading-actions [data-action="new-workout"]').tap();
      const workoutName = 'Moj mobilni trening sa dugim nazivom koji ostaje čitljiv i na uskom ekranu';
      const customName = 'Moja jednoručna sprava za potisak sa veoma dugim nazivom za prepoznavanje u teretani'.padEnd(100, 'x');
      assert.equal(customName.length, 100);
      await page.fill('#workout-name', workoutName);
      await page.fill('#workout-notes', 'Bilješka sa telefona');
      for (const input of await page.locator('[data-value="weight"]').all()) await input.fill('40');
      await page.locator('#create-from-workout').tap();
      await page.fill('#custom-name', customName);
      await page.selectOption('#custom-group', 'Grudi');
      await page.locator('button[form="custom-exercise-form"]').tap();
      await page.waitForSelector('#workout-form');
      assert.equal(await page.inputValue('#workout-name'), workoutName);
      assert.equal(await page.inputValue('#workout-notes'), 'Bilješka sa telefona');
      assert.equal(await page.locator('[data-value="weight"]').first().inputValue(), '40');
      assert.equal(await page.locator('.exercise-entry').count(), 2);
      await noOverflow(page, '100-character custom exercise in mobile logger');
      const customEntry = page.locator('.exercise-entry').nth(1);
      const customId = await customEntry.locator('[data-photo]').first().getAttribute('data-photo');
      const image = await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600;
        const drawing = canvas.getContext('2d'); drawing.fillStyle = '#e6d8c8'; drawing.fillRect(0, 0, 800, 600);
        drawing.fillStyle = '#4a5558'; drawing.fillRect(150, 230, 500, 80); drawing.fillRect(200, 310, 30, 180);
        return canvas.toDataURL('image/png').split(',')[1];
      });
      const chooser = page.waitForEvent('filechooser');
      await customEntry.locator('[data-photo]').first().tap();
      await (await chooser).setFiles({ name: 'moja-mobilna-sprava.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
      await page.waitForSelector(`[data-preview-photo="${customId}"] img`);
      for (const input of await page.locator('.exercise-entry').nth(1).locator('[data-value="weight"]').all()) await input.fill('12,5');
      await accessibleControlSizes(page, 'mobile workout with photo');
      await page.locator('button[form="workout-form"]').tap();
      await page.waitForSelector('.modal', { state: 'detached' });
      await page.reload();
      await mobileNav(page, 'workouts');
      assert.equal(await page.locator('[data-workout]').count(), 1);
      assert.equal(await page.locator('.workout-name strong').innerText(), workoutName);
      await noOverflow(page, 'long workout title in mobile history');
      await page.locator('.row-open').tap();
      assert.ok(await page.locator('.detail-equipment').isVisible(), 'equipment photo persists with the workout');
      await page.locator('.modal-footer [data-close]').tap();
      await mobileNav(page, 'exercises');
      await page.fill('#library-search', customName);
      assert.equal(await page.locator('.exercise-card').count(), 1);
      assert.equal(await page.locator('.exercise-card h3').innerText(), customName);
      assert.ok(await page.locator('.equipment-photo img').isVisible(), 'custom equipment photo persists after reload');
      await noOverflow(page, 'long custom label and photo in mobile library');
      assert.deepEqual(errors, []);
      console.log('Mobile touch workflow passed: custom exercise, long labels, preserved draft, photo upload, workout save and reload.');
    } finally { await context.close(); }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
