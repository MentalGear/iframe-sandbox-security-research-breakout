import { test, expect } from '@playwright/test';

/**
 * Research 11: CSP delivery via <meta> — limits and failure modes.
 *
 * NOTE: like every other suite in this repo, these specs depend on backlog item T1
 * (the e2e harness). They are written against the corrected URL and the
 * `allow-scripts` capability the sandbox needs in order to run anything at all.
 */

const PLAYGROUND = 'http://localhost:4444/playground/index.html';
const ASSET = 'http://localhost:4444/playground/test-assets/local-image.svg';

test.describe('Research 11: meta-CSP delivery', () => {

    // 11.1 — frame-ancestors / report-uri / sandbox are discarded by the browser.
    test('11.1 the browser ignores three directives delivered via <meta>', async ({ page }) => {
        const warnings: string[] = [];
        page.on('console', m => {
            if (/ignored when delivered via a <meta> element/i.test(m.text())) warnings.push(m.text());
        });

        await page.goto(PLAYGROUND);
        await page.evaluate(() => {
            const f = document.createElement('iframe');
            f.setAttribute('sandbox', 'allow-scripts');
            f.srcdoc = `<!DOCTYPE html><html><head>
                <meta http-equiv="Content-Security-Policy"
                      content="default-src 'none'; frame-ancestors 'none'; report-uri /r; sandbox allow-scripts;">
            </head><body></body></html>`;
            document.body.appendChild(f);
        });
        await page.waitForTimeout(1000);

        // If this ever fails, the browser has started honouring them - revisit 11.1.
        expect(warnings.join(' ')).toContain('frame-ancestors');
    });

    // 11.2 — a policy parsed into <body> is not applied at all.
    test('11.2 a meta CSP outside <head> is dropped entirely', async ({ page }) => {
        await page.goto(PLAYGROUND);

        const escaped = await page.evaluate(async ({ asset }) => {
            const build = (doc: string) => new Promise<boolean>(resolve => {
                const f = document.createElement('iframe');
                f.setAttribute('sandbox', 'allow-scripts');
                const handler = (e: MessageEvent) => {
                    if (!e.data || !('loaded' in e.data)) return;
                    window.removeEventListener('message', handler);
                    resolve(e.data.loaded);
                };
                window.addEventListener('message', handler);
                f.srcdoc = doc;
                document.body.appendChild(f);
                setTimeout(() => resolve(false), 3000);
            });

            const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline';">`;
            const probe = `<script>
                const i = new Image();
                i.onload  = () => parent.postMessage({loaded: true}, '*');
                i.onerror = () => parent.postMessage({loaded: false}, '*');
                i.src = '${asset}';
            </script>`;

            return {
                // an <img> in <head> implicitly closes it, pushing the meta into <body>
                metaPushedToBody: await build(`<!DOCTYPE html><html><head><img src="${asset}">${csp}</head><body>${probe}</body></html>`),
                metaInHead:       await build(`<!DOCTYPE html><html><head>${csp}</head><body>${probe}</body></html>`),
            };
        }, { asset: ASSET });

        expect(escaped.metaInHead).toBe(false);        // policy applied
        expect(escaped.metaPushedToBody).toBe(true);   // policy silently absent
    });

    // 11.3 — the regex-spliced security block can be swallowed by user markup.
    test('11.3 user content can delete the injected CSP', async ({ page }) => {
        await page.goto(PLAYGROUND);

        const payload = `<html><body><!-- <head> -->
            <script>
              const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
              parent.postMessage({ cspPresent: !!meta }, '*');
            </script></body></html>`;

        const report = await page.evaluate(async (html) => {
            return await new Promise<any>(resolve => {
                const handler = (e: MessageEvent) => {
                    if (!e.data || !('cspPresent' in e.data)) return;
                    window.removeEventListener('message', handler);
                    resolve(e.data);
                };
                window.addEventListener('message', handler);
                const s = document.querySelector('lofi-sandbox') as any;
                s.setConfig({ capabilities: ['allow-scripts'] });
                s.load(html);
                setTimeout(() => resolve({ timeout: true }), 5000);
            });
        }, payload);

        // Currently FAILS by design: this documents the open vulnerability (backlog S2).
        // Once the injection is structural rather than textual, this should pass.
        expect(report.cspPresent, 'security block was swallowed by a user comment').toBe(true);
    });
});
