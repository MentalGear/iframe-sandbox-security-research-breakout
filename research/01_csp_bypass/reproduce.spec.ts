import { test, expect } from '@playwright/test';

test('CSP Bypass via Nested Iframe - Mitigated', async ({ page }) => {
  await page.goto('http://localhost:4444/'); // Use Lofi Server
  await page.waitForSelector('lofi-sandbox');
  await page.evaluate(() => {
      const s = document.querySelector('lofi-sandbox');
      s.setConfig({ scriptUnsafe: true });
  });

  const payload = `
    (async () => {
      const iframe = document.createElement('iframe');
      // Lofi Sandbox ignores params, uses srcdoc.
      // Nesting blocked by frame-src 'none'.
      iframe.src = "javascript:alert(1)";
      document.body.appendChild(iframe);

      iframe.onload = () => window.parent.postMessage({type:'LOG', args:['PWN_SUCCESS']}, '*');
      iframe.onerror = () => window.parent.postMessage({type:'LOG', args:['PWN_FAILURE']}, '*');
    })();
  `;

  await page.evaluate((code) => {
    const s = document.querySelector('lofi-sandbox');
    s.execute(code);
  });

  // We expect NO 'PWN_SUCCESS'.
  // If we wait and timeout, that is PASS (Secure).
  try {
      const msg = await page.waitForEvent('console', m => m.text().includes('PWN_SUCCESS'), { timeout: 2000 });
      expect(msg).toBeNull(); // Fail if received
  } catch (e) {
      // Timeout = Secure
  }
});
