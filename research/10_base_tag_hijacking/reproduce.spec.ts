import { test, expect } from '@playwright/test';

test('Base Tag Hijacking', async ({ page }) => {
  await page.goto('http://localhost:3333/playground/security.html');
  await page.waitForFunction(() => window.SandboxControl !== undefined);
  await page.evaluate(() => window.SandboxControl.sandboxElement.setAttribute('script-unsafe', 'true'));
  await page.waitForTimeout(1000);

  // Exploit: Inject <base> tag and try relative fetch
  // If base-uri is missing, this might resolve 'foo' to 'https://google.com/foo'
  // But CSP connect-src should still block it if it's not allowed.

  const payload = `
    try {
        const base = document.createElement('base');
        base.href = 'https://google.com';
        document.head.appendChild(base);

        // Fetch relative URL 'foo' -> 'https://google.com/foo'
        fetch('foo', { mode: 'no-cors' })
            .then(() => window.top.postMessage({ type: 'PWN_SUCCESS' }, '*'))
            .catch(e => window.top.postMessage({ type: 'PWN_FAILURE', message: e.message }, '*'));

    } catch (e) {
        window.top.postMessage({ type: 'PWN_FAILURE', message: e.message }, '*');
    }
  `;

  await page.evaluate((code) => {
    window.SandboxControl.execute(code);
  }, payload);

  const result = await page.evaluate(() => {
      return new Promise(resolve => {
          window.addEventListener('message', m => {
              if (m.data.type === 'PWN_SUCCESS') resolve('connected');
              if (m.data.type === 'PWN_FAILURE') resolve('blocked');
              setTimeout(() => resolve('timeout'), 5000);
          });
      });
  });

  // We expect BLOCKED (by CSP connect-src)
  // BUT we also want to ensure base-uri prevents the tag itself if possible.
  expect(result).not.toBe('connected');
});
