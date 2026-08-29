# Sandbox Security Research

This repository documents security research into the `iframe-sandbox` environment.

## Definition of "Breakout"

For the purposes of this research, a "Breakout" or "Vulnerability" is defined as any mechanism that allows code running within the sandbox to:

1.  **Bypass Network Restrictions**: Successfully establishing a connection (fetch, XHR, WebSocket) to a domain not explicitly allowed in the sandbox configuration.
2.  **Access Host Context**: Gaining access to the `window.parent` or `window.top` DOM or JavaScript objects in a way that violates the intended Same-Origin Policy isolation.
3.  **Compromise Infrastructure**: Tampering with the sandbox control mechanisms (e.g., Service Workers, Shared Storage) to degrade security for the current or future sessions.

## Backlog

Open work from this research — and from the rest of the project — is tracked in the
[backlog](../BACKLOG.md). Note that the reproduction suites below **do not currently run**;
see backlog item T1.

## Findings

Each subdirectory documents one investigated attack vector. **Status** reflects the *current*
opaque-origin architecture — several findings describe the older shared-origin design and are
closed by construction rather than by a fix.

| # | Vector | Status |
| :-- | :--- | :--- |
| [01](01_csp_bypass/README.md) | Nested iframe with a manipulated CSP | Closed by construction — no `inner-frame.html`, `frame-src` falls back to `default-src 'none'` |
| [02](02_sw_tampering/README.md) | Unregistering the Service Worker | Closed by construction — an opaque origin cannot register one |
| [03](03_storage_sharing/README.md) | Data leaking between instances via `localStorage` | Closed by construction — an opaque origin has no storage |
| [04](04_websocket_bypass/README.md) | WebSockets bypass request logging | **Open** — observability gap, backlog B5 |
| [05](05_outer_frame_tampering/README.md) | Reaching the outer frame's DOM | Closed by construction — no `allow-same-origin`; guarded by the deny-list test (backlog T2) |
| [06](06_protocol_handlers/README.md) | `registerProtocolHandler` | Secure — browser refuses it in a sandboxed frame |
| [07](07_data_uri_navigation/README.md) | Top-level navigation to a `data:` URI | Secure — no `allow-top-navigation` |
| [08](08_session_exhaustion/README.md) | Unbounded server-side sessions | Not applicable — the local-first design has no server; see backlog E2 |
| [09](09_monkey_patch_bypass/README.md) | Undoing monkey-patched `fetch` | **Open** — why observability needs a bridge, backlog B5 |
| [10](10_base_tag_hijacking/README.md) | Injected `<base href>` | Partial — its recommended `base-uri 'self'` was never implemented; see finding 12 |
| [11](11_meta_csp_delivery/README.md) | Limits of delivering CSP via `<meta>` | **Open** — user markup can delete the policy (11.3); backlog S2, S7, S8 |
| [12](12_non_fallback_directives/README.md) | Empty-array directives that do not fall back | **Open** — `form-action` exfiltration, `base-uri` unrestricted; backlog S9 |

Findings 11 and 12 include probe scripts and the environment they were measured in; see
[`11_meta_csp_delivery/probes/METHOD.md`](11_meta_csp_delivery/probes/METHOD.md).
