# Prior art: browser-native untrusted-code sandboxing

A survey of other projects that isolate untrusted JS/HTML in the browser, triaged **learn / use / lift** for
this sandbox. Complements the existing in-repo comparisons (`COMPARISON.md`, `COMPETITOR_ANALYSIS_2.md`,
`ARCHITECTURE_COMPARISON.md`, which cover Zoid / Penpal / JetBrains-websandbox / `cross-origin-html-embed`)
and the gap analysis in `webxdc-conformance-oracle.md`. Data from npm-registry lookups (exact publish
timestamps) + GitHub page fetches on 2026-08-29; GitHub REST API was blocked in the research environment, so
star counts / commit dates are page-scraped and approximate — npm publish dates are exact.

## Candidates

| Project | Approach | No-backend? | Maturity / activity | License | Relation to this sandbox | Verdict |
|---|---|---|---|---|---|---|
| **`@sebastianwessel/quickjs`** | WASM QuickJS VM, TS wrapper w/ mountable VFS + `allowFetch`/`allowFs` flags | Yes | Active — v3.1.0, 2026‑06‑08 | MIT | Zero-ambient-authority JS VM: a ready superset of worker-mode + VFS | **Lift** — closest off-the-shelf fix for the worker-mode network-escape gap |
| **`quickjs-emscripten`** (justjake) | Raw WASM QuickJS, sync/async, no DOM | Yes | Active — v0.32.0, 2026‑02‑16; ~1.7k★ | MIT | Foundation the above wraps; real VM isolation for pure-logic execution | **Lift** (worker/headless mode only — no HTML/CSS rendering; complements iframe mode) |
| **SES / Endo / Compartments** (endojs/endo) | Capability hardened realm: `lockdown()` freezes intrinsics, `Compartment` = zero-ambient-authority sub-realm | Yes (client lib) | Very active — v2.3.0, 2026‑08‑13; ~1.1k★ | Apache-2.0 | Directly targets the intrinsic-tampering class in test `09_monkey_patch_bypass`: `lockdown()` inside the sandboxed realm freezes `fetch`/prototypes | **Lift** — defense-in-depth *inside* the iframe, not a replacement for it |
| **near-membrane** (`@locker/near-membrane-base`, Salesforce) | Proxy "membrane" realm isolation in a same-domain iframe; powers Lightning Locker | Yes | Very active — v0.19.0, 2026‑08‑14 | MIT | Fine-grained per-object API exposure vs. this sandbox's blanket CSP/allow-list | **Learn** — has open bypass reports (Firefox escape, `RangeError` stack-overflow); heavy to lift, but the exposure-surface design is worth studying |
| **LavaMoat** | SES-based capability sandbox for a *dependency graph*; per-package policy file of allowed globals | Partially (build/Node) | Active — v11.1.4, 2026‑06‑25; ~1.2k★ | MIT | Different threat model (semi-trusted deps) | **Learn** — borrow the declarative "what globals may this code touch" policy pattern |
| **`iframe-worker`** (squidfunk) | 690-byte shim running worker-like scripts inside an iframe | Yes | Active — v1.0.4, 2025‑11‑12; ~56★ | MIT | Structurally the exact shape the worker-mode fix needs (worker hosted *inside* the iframe) | **Learn** — read its iframe-hosted-worker wiring when implementing that fix; not itself a security tool |
| **Sandpack / Nodebox** (CodeSandbox) | Nodebox = Node runtime in a Worker (no backend); Sandpack = iframe preview harness | Yes | Stale-ish — Sandpack 2025‑02‑14, Nodebox 2023‑11‑29 | Apache-2.0 (Nodebox: **verify** — "SEE LICENSE") | Different scope (trusted-tenant dev preview, not adversarial isolation) | **Learn** — Worker-based VFS + dependency caching is precedent for the VFS hub |
| **StackBlitz WebContainers** | WASM Node/OS runtime; security = the browser's own process sandbox | Yes (runtime) | Active, commercial | **Verify** — wrapper MIT, core closed-source (conflicting claims) | Adjacent (dev environment, not hostile-code isolation) | **Learn only** — proprietary core, doesn't add a security model |
| **Figma plugin sandbox** | WASM QuickJS, JS fully separated from DOM | Yes | Mature, production since ~2021 | Proprietary, no source | Validates "isolate the JS engine, not just the origin" | **Learn only** — no code to use |
| **iframe-coordinator** (purecloudlabs) | postMessage routing between *trusted* micro-frontends | Yes | Active — v6.5.2, 2026‑06‑18; ~27★ | MIT | Orthogonal — no untrusted-code/CSP concern | **Learn** (maybe the message-schema ideas) |

**Excluded as noise:** `jailed` (dead since 2016), `webext-sandbox` (0.0.0 placeholder, WIP), `@hpcc-js/... sandbox` (no such package — misremembered name), and the Zoid/Penpal-class libraries already triaged in-repo (confirmed not security tools).

## Synthesis

- **Closes a documented gap directly:** **`@sebastianwessel/quickjs`** (or raw `quickjs-emscripten`) is the strongest **lift** for the **worker-mode network-escape** gap — a real zero-ambient-authority VM replaces the "Worker inherits host CSP" TODO in `host.ts`, rather than papering over it (headless/logic mode only — it has no DOM, so iframe mode still owns HTML/CSS rendering). **SES/Endo's `lockdown()`** is the strongest **complement** for the **monkey-patch-bypass** finding (test `09`), as an in-realm hardening layer that leaves the iframe/CSP/opaque-origin perimeter intact.
- **Nothing replaces this sandbox wholesale.** Everything doing full HTML/CSS rendering (Sandpack, WebContainers, iframe-coordinator) targets a different threat model (trusted/semi-trusted previews or micro-frontends) or is proprietary. The realm/membrane libs (SES, near-membrane, LavaMoat) are strong on JS-level hardening but do not address DOM/network/storage isolation — the iframe + CSP + opaque-origin layer still has to.

## Could not verify
- GitHub star/commit dates for several rows (API blocked; page-scraped, approximate) — npm publish dates are exact and used for "activity".
- **WebContainers** license (MIT wrapper vs. closed core — conflicting) and **Nodebox** license (`"SEE LICENSE IN ./LICENSE"`, not read) — check before citing an SPDX id.
- **near-membrane** bypass history — two GitHub issue titles suggest past escapes (Firefox; `RangeError` stack-overflow); fixed/open status not confirmed — verify before relying on it for anything security-load-bearing.
