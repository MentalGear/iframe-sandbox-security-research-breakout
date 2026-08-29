# Backlog: Gaps vs. Existing Solutions

Derived from the prior-art analysis in [`COMPARISON.md`](COMPARISON.md),
[`COMPETITOR_ANALYSIS_2.md`](COMPETITOR_ANALYSIS_2.md) and
[`IMPROVEMENTS.md`](IMPROVEMENTS.md), re-grounded against the code as it stands today.

**Method**: for every capability an established solution ships, ask three questions —
*do we have it*, *do we want it*, *what is the smallest honest increment*. Items that
we deliberately do **not** want are recorded in [Rejected](#rejected--explicitly-out-of-scope)
rather than dropped, so the decision is not re-litigated.

**Method note**: every "current state" line below points at real code. Where a comparison
doc claims a capability the code does not yet deliver, the gap is filed as a backlog item
rather than quietly corrected in the doc.

---

## Reference Set

| Solution | What it is good at | What we take from it |
| :--- | :--- | :--- |
| [`JetBrains/websandbox`](https://github.com/JetBrains/websandbox) | Promise-based RPC into the sandbox | Bidirectional call API (B1) |
| [Penpal](https://github.com/Aaronius/penpal) | Minimal, well-typed iframe transport | Typed connection lifecycle (B2) |
| [Zoid](https://github.com/krakenjs/zoid) | Strict host↔frame bridge, prop contracts | Bridged network, sizing (B4, B5) |
| [`cross-origin-html-embed`](https://github.com/Perspective-Software/cross-origin-html-embed) | Unique origins via wildcard DNS | Opt-in hosted-origin mode (A3) |
| CodeSandbox / StackBlitz | Full preview environments, virtual FS | In-sandbox VFS API (C1–C3) |
| Figma plugin sandbox (QuickJS/WASM) | VM-grade JS isolation | Logic-only tier (A4) |
| Cloudflare Workers | Hard quotas on untrusted code | CPU/memory quotas (E1) |

---

## Capability Matrix

Legend: ✅ shipped · 🟡 partial · ❌ missing · ➖ not applicable to that design.

| Capability | lofi-web-sandbox | websandbox | Penpal | Zoid | cross-origin-embed |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Isolation without server config | ✅ opaque origin | 🟡 | ➖ | ➖ | ❌ wildcard DNS |
| Private channel (`MessageChannel`) | ✅ | ❌ | 🟡 | ✅ | ❌ |
| Promise-based RPC (host ↔ sandbox) | ❌ **B1** | ✅ | ✅ | ✅ | ➖ |
| Typed public API / `d.ts` | ❌ **D1** | ✅ | ✅ | ✅ | ✅ |
| Headless (worker) execution | 🟡 **A1** | ❌ | ❌ | ❌ | ❌ |
| Virtual files | 🟡 **C1–C3** | ❌ | ➖ | ❌ | ❌ |
| Host-mediated network / observability | ❌ **B5** | ❌ | ➖ | ✅ | ❌ |
| Auto-sizing to content | ❌ **B4** | ❌ | 🟡 | ✅ | ✅ |
| Execution quotas (CPU/memory) | 🟡 **E1** | ❌ | ➖ | ❌ | ➖ |
| Installable package (npm) | ❌ **D1** | ✅ | ✅ | ✅ | ✅ |

The two columns where we are already ahead — isolation without server config, and a private
`MessageChannel` — are exactly the ones the backlog must not regress.

---

## A. Isolation & Threat Model

### A1 · Worker mode escapes the sandbox CSP — **P0 · S**

*Prior art*: no competitor ships headless isolation; `COMPETITOR_ANALYSIS_2.md` lists it as our
differentiator. The claim is currently unsound, which makes this the most expensive gap we have.

**Current state**: `spawnWorker()` creates the worker from a `blob:` URL on the *host* document
(`src/host.ts:206`). It therefore inherits the host origin and the host CSP — not the sandbox
policy. The code says so itself at `src/host.ts:196`:

> `// TODO: this is wrong! we need to place the worker inside the iframe, otherwise the worker has full network access (has host CSP policy)`

**Work**: always create the iframe, and spawn the worker *from inside* it so it inherits the
opaque origin and the injected `<meta>` CSP. Route the `MessagePort` handshake through the frame.

**Acceptance**: an e2e test in `test/e2e/worker-security.spec.ts` where worker-mode code fetches a
domain absent from `connectionsAllowed` and the request is blocked; the same assertion passes in
iframe mode.

### A2 · Lock the capability deny-list with a regression test — **P1 · S**

*Prior art*: `websandbox` weakens to near-zero isolation when consumers add `allow-same-origin`.
Findings [01](01_csp_bypass/README.md), [02](02_sw_tampering/README.md) and
[05](05_outer_frame_tampering/README.md) all root-cause to that single attribute.

**Current state**: `ALLOWED_CAPABILITIES` (`src/csp-directives.ts:1`) correctly omits
`allow-same-origin` and `allow-top-navigation`, and `setConfig()` filters unknown values
(`src/host.ts:70`). Nothing tests that this stays true.

**Work**: a unit test asserting the forbidden set is rejected, plus an e2e test asserting
`window.parent.document` access throws.

**Acceptance**: removing the filter in `setConfig()` turns the suite red.

### A3 · Opt-in hosted unique-origin mode — **P2 · L**

*Prior art*: `cross-origin-html-embed`, CodeSandbox (`*.csb.app`), StackBlitz.

**Current state**: opaque origins only. Storage, Service Workers and `crossOriginIsolated` APIs
are unavailable *inside* the sandbox by design — correct for previews, blocking for consumers
running real apps.

**Work**: an adapter that serves the sandbox from `<uuid>.sandbox.tld` behind the same public API,
selected via `mode: 'hosted-origin'`. Local-first stays the default; the hosted path is additive.

**Acceptance**: identical preset runs under both modes; hosted mode additionally passes a
storage-isolation test between two instances ([finding 03](03_storage_sharing/README.md)).

### A4 · Spike: WASM/QuickJS logic-only tier — **P3 · M**

*Prior art*: Figma's plugin sandbox. **Work**: timeboxed spike on `quickjs-emscripten` for a
no-DOM tier, measuring startup cost and bundle size. Output is a recommendation document, not code.

---

## B. API Surface & DX

### B1 · Promise-based RPC in both directions — **P0 · M**

*Prior art*: `websandbox` (`connection.remote.fn()`), Penpal, Zoid. This is the single largest
DX gap and the reason the library is currently hard to adopt.

**Current state**: `execute(code)` is fire-and-forget (`src/host.ts:119`). The in-sandbox script
runs `new Function(code)` and discards the return value (`src/lib/in-sandbox-script.ts:15`);
only `LOG` frames travel back over the port. Callers cannot await a result, and a thrown error
surfaces as a log line rather than a rejected promise.

**Work**: add a correlated request/response envelope (`id`, `type`, `payload`) over the existing
`MessagePort`; expose `sandbox.call(name, ...args): Promise<T>` on the host and a symmetric
`host.call(...)` inside the sandbox; keep `execute()` as the `scriptUnsafe`-gated escape hatch.

**Acceptance**: `await sandbox.call('sum', 1, 2) === 3`; a sandbox-side throw rejects the host
promise with the original message; results survive both iframe and worker mode.

### B2 · Per-instance events (fixes a live defect) — **P1 · S**

*Prior art*: Penpal's typed connection lifecycle.

**Current state**: logs are dispatched on `window`, not on the element
(`src/host.ts:139`, `:156`, `:212`), while `SandboxDevTools` filters with
`if (e.target !== this._sandbox) return;` (`src/devtools.ts:13`). Since the target is always
`window`, **that filter drops every log and DevTools shows nothing**. It also means two sandboxes
on one page produce indistinguishable output.

**Work**: dispatch `log` / `error` / `terminated` on the `LofiSandbox` element itself and let
DevTools subscribe to the instance. Keep a documented, opt-in global mirror for the playground.

**Acceptance**: with two sandboxes mounted, each element receives only its own logs; the DevTools
regression is covered by a test.

### B3 · Lifecycle: `terminate()`, `reset()`, iframe timeouts — **P1 · M**

*Prior art*: `IMPROVEMENTS.md` §4 (state machine); Zoid's explicit component lifecycle.

**Current state**: `workerExecutionTimeout` exists but is enforced for worker mode only
(`src/host.ts:136`). Teardown is private (`initialize()` / `_cleanupWorker()`); consumers have no
supported way to stop a runaway sandbox, and iframe mode has no timeout at all.

**Work**: public `terminate()` and `reset()`; an explicit state enum
(`idle → initializing → ready → running → terminated`) surfaced as a readonly property; a
watchdog that recreates the frame in iframe mode.

**Acceptance**: an infinite loop in iframe mode is terminated within the configured budget and
emits `terminated`; `reset()` yields a fresh opaque origin.

### B4 · Content auto-sizing channel — **P2 · S**

*Prior art*: the headline feature of `cross-origin-html-embed`; Zoid ships it too.

**Current state**: the iframe is fixed at `width:100%;height:100%` (`src/host.ts:224`).

**Work**: a `ResizeObserver` inside the sandbox reporting `scrollHeight` over the existing port;
opt-in via `autoResize: true`. **Acceptance**: host element height tracks content within one frame.

### B5 · Host-mediated `sandbox.fetch` bridge — **P2 · M**

*Prior art*: Zoid's strict bridge. *Motivated by* [finding 04](04_websocket_bypass/README.md)
(WebSockets bypass any SW-based logging) and [finding 09](09_monkey_patch_bypass/README.md)
(monkey-patching `fetch` is trivially undone).

**Current state**: no bridge; network policy is CSP-only, which controls *whether* a request is
allowed but yields no record of it.

**Work**: per `IMPROVEMENTS.md` §2 — expose `sandbox.fetch` over the port, set `connect-src 'none'`
by default in bridged mode, and polyfill `globalThis.fetch` to route through it. Document the
trade-off: libraries that reach for a raw socket will break, deliberately.

**Acceptance**: every sandbox-initiated request appears in a host-side log; a direct `WebSocket`
call is refused by CSP in bridged mode.

---

## C. Virtual Files

### C1 · In-sandbox VFS API — **P1 · M**

*Prior art*: CodeSandbox / StackBlitz preview environments.
[`RESEARCH_VFS_ACCESS.md`](RESEARCH_VFS_ACCESS.md) specifies this; it is not implemented.

**Current state**: one-way only. The host pushes with `registerFiles()` (`src/host.ts:92`);
sandboxed code can *load* files through the `<base>` tag but cannot list, read or write them.

**Work**: implement the message-bridge option from the research doc as
`sandbox.fs.read/write/list`, mediated by the host so policy stays on the trusted side.

**Acceptance**: sandboxed code writes a file, reads it back, and the host observes the change via
`fileschanged`.

### C2 · MIME types and binary files — **P1 · S**

**Current state**: two concrete defects in `src/virtual-files/sw.ts` —
every response is served as `text/javascript` (`sw.ts:61`, marked `// TODO: Proper MIME`), and
`fileCache` is a `Map<string, string>` that casts with `content as string` (`sw.ts:2`, `:29`)
even though `registerFiles()` advertises `Record<string, string | Uint8Array>` (`src/host.ts:92`).
**Binary registration is therefore broken at the type boundary**, and CSS or images served as
JavaScript are rejected by strict MIME checking.

**Work**: extension→MIME resolution; store `string | Uint8Array` and construct the `Response`
from the stored type. **Acceptance**: an SVG and a CSS file from `playground/test-assets/` load
correctly inside the sandbox and are asserted in `test/e2e/virtual-files-real.spec.ts`.

### C3 · File lifecycle and cache eviction — **P2 · S**

*Lesson from* [finding 08](08_session_exhaustion/README.md), applied to the client.

**Current state**: `fileCache` grows without bound and is never pruned (`sw.ts:2`); entries keyed
by a dead session ID outlive the sandbox for the lifetime of the Service Worker.

**Work**: `unregisterFiles()` / `clearSession()`; drop a session's keys when its sandbox is
terminated; cap total bytes per session.

**Acceptance**: terminating a sandbox releases its VFS entries, asserted from the hub.

### C4 · Service Worker update integrity — **P2 · M**

*Prior art / analysis*: [`SW-verify-before-update.md`](SW-verify-before-update.md).
**Work**: adopt the main-thread pre-registration verification and versioned SW paths described
there. **Acceptance**: a modified SW payload fails verification and is not registered.

---

## D. Packaging & Distribution

### D1 · Ship an installable package — **P0 · S**

*Prior art*: every solution in the reference set installs with one command. We do not install at
all, which caps adoption regardless of how good the isolation is.

**Current state**, all verifiable in `package.json`:
- `"private": true` — publishing is blocked.
- `"main": "dev-server.ts"` — **that file does not exist** in the repo.
- No `exports`, no `types`; `build-dist` emits JS with no declaration files.
- `"test:e2e"` points at `research/playwright.config.ts`; there is **no `research/` directory** —
  the config lives at the repo root, so `bun test` fails at the e2e step.
- `build.ts:38` reads `playground/virtual-files-demo.html`, which no longer exists
  (`playground/index.html` replaced it), so `bun run build` cannot complete.
- `README.md` documents a `server.ts`; the dev server is a Vite plugin in `vite.config.ts`.

**Work**: fix the two broken script/build paths, drop `private`, add `exports` + `types` with
declaration emit, and align the README with the actual entry points.

**Acceptance**: `bun test` runs unit **and** e2e; `bun run build` completes; a packed tarball
imports cleanly in a scratch project with working types.

### D2 · CI across the configured browsers — **P2 · S**

**Current state**: `playwright.config.ts` already defines chromium, firefox and webkit projects,
and [`BROWSER_COMPATIBILITY.md`](BROWSER_COMPATIBILITY.md) makes claims about them — but there is
no `.github/` directory, so nothing runs them. Every claim is currently untested on merge.

**Work**: a workflow running unit + e2e on push and PR. **Acceptance**: a regression in any
finding's `reproduce.spec.ts` fails the PR.

### D3 · API reference and adapters — **P3 · M**

**Work**: document the public surface once B1–B3 stabilise it; thin React/Vue wrappers around the
custom element. **Acceptance**: a consumer can integrate from the docs without reading `host.ts`.

---

## E. Quotas & Abuse Resistance

### E1 · CPU and memory budgets — **P2 · M**

*Prior art*: Cloudflare Workers' hard quotas; analysis in
[`RESOURCE_QUOTAS.md`](RESOURCE_QUOTAS.md).

**Current state**: only `workerExecutionTimeout`, worker mode only (`src/host.ts:136`). A busy
loop in iframe mode blocks the host's main thread; nothing caps allocation in either mode.

**Work**: pair with B3's watchdog; sample `performance.measureUserAgentSpecificMemory()` where
available and terminate over budget. **Acceptance**: an allocation bomb is terminated instead of
crashing the tab.

### E2 · Session exhaustion — **deferred, tracked**

[Finding 08](08_session_exhaustion/README.md) and `IMPROVEMENTS.md` §1 describe rate limiting, TTL
and an LRU cache for *server-side* session state. **The local-first architecture has no such
server**, so no work is scheduled. This becomes P1 the moment A3 lands, and is recorded here so
the requirement is not lost with the refactor that removed the server.

---

## Rejected / Explicitly Out of Scope

| Proposal | Source | Why not |
| :--- | :--- | :--- |
| Wildcard DNS + SSL as the **default** | `cross-origin-html-embed` | Destroys the local-first property — the one thing no competitor offers. Kept as opt-in A3. |
| Iframe-scoped Service Worker ("hub" model) | Considered internally | Requires a sandbox origin that can register SWs, re-opening privilege escalation. See [`ARCHITECTURE_COMPARISON.md`](ARCHITECTURE_COMPARISON.md). |
| `allow-same-origin` for API compatibility | `websandbox` | Root cause of findings 01, 02 and 05. Non-negotiable; enforced by A2. |
| Agent runtime in the trusted base ("DeepAgents") | [`RESEARCH_SANDBOXING.md`](RESEARCH_SANDBOXING.md) | Keep the base dumb; agents load as user code so their bugs stay inside the sandbox. |
| Nonce-based CSP instead of `'unsafe-inline'` | General best practice | Rationale in [`CSP_CONFIG_RATIONALE.md`](CSP_CONFIG_RATIONALE.md) §3 — no benefit under an opaque origin with immutable `srcdoc` CSP. |

---

## Already Closed

Recorded so `IMPROVEMENTS.md` is not re-proposed wholesale:

- **`MessageChannel` communication** (`IMPROVEMENTS.md` §3) — implemented in `setupChannel()`
  (`src/host.ts:150`) for both iframe and worker targets.
- **CSP generation from a typed config** — `src/lib/csp/csp-generator.ts`, with a hardened
  `default-src 'none'` fallback and unit tests.
- **Opaque origin via `srcdoc`** — closes findings 03 and 05 by construction.
- **Headless worker mode** — API shipped, but **isolation is not yet real**; see A1.

---

## Suggested Order

| Milestone | Items | Rationale |
| :--- | :--- | :--- |
| **M1 — Make the claims true** | A1, D1, B2 | A documented capability that does not hold (A1) or does not install (D1) costs more than a missing one. B2 rides along: DevTools is currently silent. |
| **M2 — Make it adoptable** | B1, B3, A2, D2 | RPC plus lifecycle is the parity bar set by `websandbox` and Penpal; A2 and D2 stop the gains regressing. |
| **M3 — Make it capable** | C1, C2, C3, B4, B5 | Preview-environment parity: real virtual files, sizing, observable network. |
| **M4 — Make it hard** | A3, C4, E1, D3 | Hosted origins, SW integrity, quotas — the production-SaaS envelope. |
| **Spike** | A4 | Independent; run whenever there is slack. |
