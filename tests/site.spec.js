const { test, expect } = require('@playwright/test');
const { press } = require('./helpers');

test.describe('homepage', () => {
  test('loads without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error));
    await page.goto('/');
    await expect(page.locator('#editor textarea')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the editor can be tapped or clicked and edited, updating the preview', async ({ page }, testInfo) => {
    await page.goto('/');
    const textarea = page.locator('#editor textarea');
    await press(textarea, testInfo, { position: { x: 40, y: 30 } });
    await expect(textarea).toBeFocused();

    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.type('<p id="edited">Edited</p>');

    await expect.poll(() => page.evaluate(() => document.querySelector('#editor').value)).toContain('<p id="edited">');
    await expect
      .poll(() => page.evaluate(() => document.querySelector('#preview').contentDocument.querySelector('#edited')?.textContent))
      .toBe('Edited');
  });

  test('the editor fits its content without a vertical scrollbar', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.querySelector('#editor').textarea);
    const sizes = await page.evaluate(() => {
      const { textarea } = document.querySelector('#editor');
      return { client: textarea.clientHeight, scroll: textarea.scrollHeight };
    });
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
  });

  test('with short code, the header and editor section fill exactly one screen', async ({ page }, testInfo) => {
    test.skip(testInfo.project.use.viewport.width < 960, 'Stacked layout is taller than the screen');
    await page.goto('/');
    await page.waitForFunction(() => document.querySelector('#editor').textarea);
    await page.evaluate(() => {
      document.querySelector('#editor').textarea.dispatchEvent(new Event('click')); // stop the typing demo
      document.querySelector('#editor').value = '<h1>Hi</h1>';
    });
    const bottom = await page.evaluate(() => document.querySelector('section').getBoundingClientRect().bottom);
    expect(Math.abs(bottom - (await page.evaluate(() => window.innerHeight)))).toBeLessThanOrEqual(1);
  });

  test('the typing demo runs', async ({ page }) => {
    await page.goto('/');
    await expect
      .poll(() => page.evaluate(() => document.querySelector('#editor').value), { timeout: 10000 })
      .not.toContain('Hello World');
  });
});
