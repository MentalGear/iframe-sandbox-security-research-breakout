import { test, expect } from '@playwright/test';

test('Service Worker Tampering - Mitigated', async ({ page }) => {
  await page.goto('http://localhost:4444/');
  await page.waitForSelector('lofi-sandbox');
  await page.evaluate(() => {
      const s = document.querySelector('lofi-sandbox');
      s.setConfig({ scriptUnsafe: true });
  });

  const payload = `
    if (!navigator.serviceWorker) {
         window.parent.postMessage({ type: 'LOG', args: ['PWN_FAILURE'] }, '*');
    } else {
         window.parent.postMessage({ type: 'LOG', args: ['PWN_SUCCESS'] }, '*');
    }
  `;

  await page.evaluate((code) => {
    const s = document.querySelector('lofi-sandbox');
    s.execute(code);
  });

  // Expect PWN_FAILURE (Secure)
  const msg = await page.waitForEvent('console', m => m.text().includes('PWN_FAILURE'));
  expect(msg).toBeTruthy();
});
