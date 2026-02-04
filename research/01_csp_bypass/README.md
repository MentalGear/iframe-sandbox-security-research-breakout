# Research 01: CSP Bypass via Nested Iframe

## Summary

The `iframe-sandbox` relies on a dynamically generated Content Security Policy (CSP) based on query parameters (`allow` and `unsafe`) passed to `inner-frame.html`. Since the inner frame is served from the same origin (`sandbox.localhost`) as the outer frame and has `allow-same-origin` set in its sandbox attribute, code running within the inner frame can create a nested `iframe` pointing to `inner-frame.html` with manipulated query parameters.

This allows an attacker to spawn a child iframe with a relaxed CSP (e.g., allowing specific domains or enabling `unsafe-eval`), effectively bypassing the restrictions imposed on the original sandbox.

## Reproduction Steps

1.  **Context**: The attack assumes the ability to execute code within the initial sandbox. In the default configuration, `unsafe-eval` is disabled, blocking `new Function()` which is used by the `execute()` helper. However, if the sandbox is configured with `script-unsafe` (or if the attacker can inject script tags via other means, e.g., if `unsafe-inline` was allowed or via DOM manipulation if `allow-same-origin` is present), the attack is feasible.

2.  **Exploit Code**:
    The exploit creates a nested iframe:
    ```javascript
    const iframe = document.createElement('iframe');
    // Request a relaxed CSP allowing google.com and unsafe-eval
    iframe.src = "/inner-frame.html?allow=google.com&unsafe";
    document.body.appendChild(iframe);
    ```

3.  **Execution**:
    Once the nested iframe loads, it has a CSP that permits connections to `google.com`. The parent frame (attacker) can then access the child frame's `document` (due to same-origin) and inject a script to perform the forbidden action (e.g., `fetch('https://google.com')`).

## Impact

This bypass renders the network firewall ineffective against an attacker who can execute code, as they can simply "ask" the server for a new environment with the permissions they need. The Service Worker attempts to filter traffic, but since the CSP is the primary enforcement mechanism for *where* requests can go (connect-src), and the Service Worker logic in `outer-sw.ts` is a "Passthrough" that relies on CSP ("CSP (set by server) will block if needed"), manipulating the CSP defeats the protection.

## Evidence

A Playwright test `reproduce.spec.ts` demonstrates this by:
1.  Enabling `script-unsafe` on the sandbox to allow initial code execution.
2.  Injecting the exploit which spawns a nested iframe with `?allow=google.com`.
3.  Successfully fetching from `google.com` within that nested frame, which would otherwise be blocked by the default sandbox rules.
