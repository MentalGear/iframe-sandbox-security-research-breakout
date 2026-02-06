import { test, expect } from '@playwright/test';

test('Monkey Patch Bypass - Mitigated', async ({ page }) => {
  await page.goto('http://localhost:4444/');
  await page.waitForSelector('lofi-sandbox');
  await page.evaluate(() => {
      const s = document.querySelector('lofi-sandbox');
      s.setConfig({ scriptUnsafe: true });
  });

  // Since we removed monkey patching (moved to VFS architecture), this test is less relevant for "Bypass",
  // but we want to ensure "Silent Fetch" is blocked or handled.
  // Actually, LofiSandbox doesn't use monkey patching for network logs anymore.
  // It relies on VFS SW (for VFS) or nothing (for external).
  // If we fetch external, it's blocked by CSP.

  const payload = `
    fetch('http://example.com')
        .then(() => window.parent.postMessage({type:'LOG', args:['PWN_SUCCESS']}, '*'))
        .catch(() => window.parent.postMessage({type:'LOG', args:['PWN_FAILURE']}, '*'));
  `;

  await page.evaluate((code) => {
    const s = document.querySelector('lofi-sandbox');
    s.execute(code);
  });

  // Expect FAILURE (Blocked by CSP)
  const msg = await page.waitForEvent('console', m => m.text().includes('PWN_FAILURE'));
  expect(msg).toBeTruthy();
});
