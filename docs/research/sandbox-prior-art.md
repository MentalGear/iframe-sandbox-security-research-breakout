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

## Recent entrants (created / first-released in the last ~6 months)

A targeted recency sweep (npm `time.created`, GitHub `created_at`, 2026 launch posts) for *new* projects,
not new releases of the established ones above. The field is genuinely more active than "nothing new" — and
**every new entrant converges on the same recipe: a QuickJS/WASM JS-VM behind an iframe or WASI boundary.**
That convergence is itself the signal: an in-browser VM for logic/worker execution + an iframe perimeter for
DOM is becoming the default, which matches the direction in `webxdc-conformance-oracle.md` (QuickJS VM for
the worker-mode gap; iframe/CSP/opaque-origin keeps DOM).

| Project | First released (source) | Approach | No-backend? | License | What's new / relation | Verdict |
|---|---|---|---|---|---|---|
| **`@tanstack/ai-isolate-quickjs`** (TanStack "AI Code Mode") | 2026‑04‑07 (npm `time.created`) | Pluggable "isolate driver" interface; QuickJS-WASM driver, tools bridged in as async ref functions, host stays outside | Yes (QuickJS driver) | MIT | Most directly on-target for "run AI-generated code safely in-browser," from a major maintained OSS team; the driver-interface idea is worth adopting even if not the package | **Learn / consider-use** |
| **`quickjs-wasi`** (vercel-labs) | 2026‑03‑06 (npm `time.created`) | QuickJS-NG via wasi-sdk; **snapshots whole VM state (incl. pending promises) and restores in a fresh instance** | Yes (standard WASM in-browser) | MIT | Real capability beyond `quickjs-emscripten`: durable pause/resume of a running sandbox — relevant to agent checkpointing | **Learn** (watch) |
| **zushi** (reearth) | 2026‑05‑28 (GitHub `created_at`) | QuickJS-WASM VM for plugin logic + **opaque-origin iframes** for plugin UI, `postMessage` membrane between them | Yes | MIT | Clean two-layer reference (VM for logic, iframe for UI, only data crosses) — the exact split this repo would use; small (early) | **Learn** (pattern reference) |
| **Lifo** (lifo-sh) | 2026‑02‑23 (GitHub `created_at`) | "Browser is the kernel" — WASM Unix-like shell, IndexedDB VFS, 60+ cmds, Node compat, client-side only | Yes | MIT | Most independent traction of the batch (~529★ in ~6mo); explicitly markets AI-agent code sandboxing; still alpha (v0.10) | **Learn** (watch closely) |
| **webpack-wasm-sandbox-plugin** | 2026‑03‑17 (GitHub `created_at`) | Build-time: wraps each **npm dependency** in its own QuickJS-WASM sandbox, deny-by-default capability policy | Yes | **verify** ("research prototype", no clear license) | Novel angle — per-dependency (supply-chain) sandboxing; single author, unproven | **Learn only** |
| **BrowserPod** (Leaning Technologies) | GA 2026‑02‑18 (vendor blog) | CheerpX-lineage: Linux-syscall-emulating WASM kernel, WebWorker process isolation, virtual FS, "Portals" | Execution client-side, but "Portals" implies an edge/backend — **not purely no-backend** | Closed / commercial ("free for personal use") | Most technically ambitious in the window (multi-process Node 22 in-browser), but not adoptable given closed licensing + partial backend | **Watch** (not adoptable) |

Excluded from the table but noted: `@deepseek-ai/dsh-fs-sandbox` (a CLI-agent FS write-scoper, not a browser
sandbox), `@cloudflare/sandbox` (Workers/server-backed), and several 0–4★ QuickJS-in-browser hobby repos
(`sentryos`, `bolojs/quickjs-sandbox`, …) — which mainly confirm QuickJS-WASM-in-iframe is now a *default
recipe* rather than a novelty.

**Recency bottom line:** no single breakout replaces this sandbox, but **TanStack Code Mode** and Vercel's
**quickjs-wasi** are the two most credible to act on (established maintainers, MIT, directly on the
AI-generated-code use case); **Lifo** has the most traction; **BrowserPod** is the most ambitious but
commercial. The convergence on QuickJS/WASM-VM-behind-a-boundary corroborates the worker-mode-gap direction.

## Could not verify
- GitHub star/commit dates for several rows in the first table (API blocked *there*; page-scraped, approximate) — npm publish dates are exact and used for "activity".
- **`webpack-wasm-sandbox-plugin`** license (labelled a research prototype, no clear SPDX id) and **BrowserPod** creation date (vendor-announcement only, no public repo) — verify before relying on either.
- **WebContainers** license (MIT wrapper vs. closed core — conflicting) and **Nodebox** license (`"SEE LICENSE IN ./LICENSE"`, not read) — check before citing an SPDX id.
- **near-membrane** bypass history — two GitHub issue titles suggest past escapes (Firefox; `RangeError` stack-overflow); fixed/open status not confirmed — verify before relying on it for anything security-load-bearing.
