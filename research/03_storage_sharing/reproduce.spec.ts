import { test, expect } from '@playwright/test';

test('Storage Sharing Between Instances - Mitigated', async ({ page }) => {
  await page.goto('http://localhost:4444/');
  await page.waitForSelector('lofi-sandbox');
  await page.evaluate(() => {
      const s = document.querySelector('lofi-sandbox');
      s.setConfig({ scriptUnsafe: true });
  });

  // 1. Write (Should fail or be ephemeral)
  await page.evaluate(() => {
    const s = document.querySelector('lofi-sandbox');
    s.execute(`
        try {
            localStorage.setItem('SECRET', '123');
            window.parent.postMessage({type:'LOG', args:['Write Done']}, '*');
        } catch(e) {
            window.parent.postMessage({type:'LOG', args:['Write Failed']}, '*');
        }
    `);
  });

  // Wait for log
  const msg1 = await page.waitForEvent('console', m => m.text().includes('Write'));

  // 2. Reload Sandbox (New srcdoc = New Origin)
  await page.reload();
  await page.waitForSelector('lofi-sandbox');
  await page.evaluate(() => {
      const s = document.querySelector('lofi-sandbox');
      s.setConfig({ scriptUnsafe: true });
  });

  // 3. Read
  await page.evaluate(() => {
    const s = document.querySelector('lofi-sandbox');
    s.execute(`
        const val = localStorage.getItem('SECRET');
        window.parent.postMessage({type:'LOG', args:['Read: ' + val]}, '*');
    `);
  });

  const msg2 = await page.waitForEvent('console', m => m.text().includes('Read:'));
  // Expect null (Isolated)
  expect(msg2.text()).toContain('Read: null');
});
