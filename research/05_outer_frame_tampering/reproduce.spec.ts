import { test, expect } from '@playwright/test';

test('Outer Frame DOM Tampering - Mitigated', async ({ page }) => {
  await page.goto('http://localhost:4444/');
  await page.waitForSelector('lofi-sandbox');
  await page.evaluate(() => {
      const s = document.querySelector('lofi-sandbox');
      s.setConfig({ scriptUnsafe: true });
  });

  const payload = `
    try {
        const p = window.parent.document;
        window.parent.postMessage({type:'LOG', args:['PWN_SUCCESS']}, '*');
    } catch(e) {
        window.parent.postMessage({type:'LOG', args:['PWN_FAILURE']}, '*');
    }
  `;

  await page.evaluate((code) => {
    const s = document.querySelector('lofi-sandbox');
    s.execute(code);
  });

  // Expect FAILURE (Cross-Origin)
  const msg = await page.waitForEvent('console', m => m.text().includes('PWN_FAILURE'));
  expect(msg).toBeTruthy();
});
