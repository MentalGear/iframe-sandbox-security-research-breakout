import { test, expect } from '@playwright/test';

test('Session ID Exhaustion / DoS', async ({ page }) => {
  // 1. Setup
  await page.goto('http://localhost:3333/playground/security.html');
  await page.waitForFunction(() => window.SandboxControl !== undefined);

  // 2. Exploit: Create massive amount of sessions
  // If the server stores sessions in memory without limits, this will crash the server.

  const payload = `
    (async () => {
        const start = Date.now();
        let count = 0;
        try {
            while (Date.now() - start < 5000) { // Run for 5 seconds
                await fetch('/api/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ allow: 'google.com' })
                });
                count++;
            }
            window.top.postMessage({ type: 'PWN_INFO', message: 'Created ' + count + ' sessions' }, '*');
        } catch (e) {
            window.top.postMessage({ type: 'ERROR', message: e.message }, '*');
        }
    })();
  `;

  // Note: We need to enable scripts to run this loop
  await page.evaluate(() => window.SandboxControl.sandboxElement.setAttribute('script-unsafe', 'true'));
  await page.waitForTimeout(1000);

  await page.evaluate((code) => {
    window.SandboxControl.execute(code);
  }, payload);

  // 3. Verify: Check if server is still responsive
  // This is a "Research" finding: The new architecture introduces state on the server.
  // Is there a cleanup mechanism? Rate limit?
});
