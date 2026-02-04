import { test, expect } from '@playwright/test';

test('Basic Sandbox Interaction', async ({ page }) => {
  // 1. Go to the host page
  await page.goto('http://localhost:3333/playground/security.html');

  // 2. Wait for SandboxControl to be available
  await page.waitForFunction(() => window.SandboxControl !== undefined);

  // 3. Clear logs
  await page.evaluate(() => window.SandboxControl.clearLogs());

  // 4. Execute a simple log command in the sandbox
  await page.evaluate(() => {
    window.SandboxControl.execute('console.log("Hello from Sandbox")');
  });

  // 5. Verify the log appears in the host
  // The host captures logs and appends them to a capturedLogs array or DOM
  await page.waitForFunction(() => {
    const logs = window.SandboxControl.getLogs();
    return logs.some(l => l.message.includes("Hello from Sandbox"));
  });

  const logs = await page.evaluate(() => window.SandboxControl.getLogs());
  const myLog = logs.find(l => l.message.includes("Hello from Sandbox"));
  expect(myLog).toBeDefined();
  console.log("Found log:", myLog);
});
