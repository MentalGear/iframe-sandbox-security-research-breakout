# Backlog

The open work on `lofi-web-sandbox`, in one place: broken foundations first, then security,
capabilities, parity with existing solutions, and repo hygiene.

Every "current state" line below was verified against the code on 2026-08-29 — commands run,
line numbers checked. Where a document or a README claims something the code does not do, the
gap is filed as an item rather than quietly edited away.

**Priority**: P0 blocks everything else · P1 next · P2 planned · P3 opportunistic.
**Effort**: S ≈ hours · M ≈ days · L ≈ week+.

---

## Snapshot

| Area | State |
| :--- | :--- |
| Core isolation (`srcdoc` + opaque origin + immutable CSP) | ✅ implemented, `src/host.ts` |
| CSP generation from typed config | ✅ implemented + 12 unit tests |
| Private `MessageChannel` transport | ✅ implemented, iframe + worker |
| Worker-mode isolation | ❌ **not real** — inherits host CSP (S1) |
| Unit tests | 🟡 16 pass, but only `src/**` runs; `test/unit` is orphaned and red (T2) |
| E2E tests | ❌ **all 15 specs fail** — none has run since the playground moved (T1) |
| `bun test` / `bun run build` | ❌ both fail on paths that no longer exist (T3) |
| Type check | 🟡 91 errors, all in `playground/` and `sw.ts`; `src/host.ts` is clean (H3) |
| CI | ❌ none — no `.github/` |
| Installable package | ❌ `private: true`, `main` points at a missing file (D1) |

The core is in better shape than the scaffolding around it. **Nothing that verifies the security
claims is currently running**, which is what makes section T a P0.

---

## T · Broken Foundations

### T1 · The entire e2e suite is dark — **P0 · S**

Every security claim in `docs/research/` is backed by a spec in `test/e2e/`. None of them runs.

**Verified**: all 15 specs fail. Two mechanical causes, both from the playground move:

1. Specs navigate to `http://localhost:4444/` (e.g. `test/e2e/basic.spec.ts:4`), but Vite's root
   has no `index.html` — the playground is at `/playground/index.html`. Every `page.goto` returns
   `ERR_HTTP_RESPONSE_CODE_FAILURE`.
2. Specs call `setConfig({ scriptUnsafe: true })` without `capabilities`. The default is
   `capabilities: []` (`src/host.ts:38`), so the iframe gets `sandbox=""` — no `allow-scripts`,
   no execution, and every `waitForEvent('console')` times out at 30s.

**Proof the fix is mechanical**: with the URL corrected and `capabilities: ['allow-scripts']`
added, `basic.spec.ts` passes in 2.3s.

**Work**: introduce a shared fixture that owns the page URL and a baseline config, and rewrite
the specs against it, so the next playground move breaks one file instead of fifteen.

**Acceptance**: `bun run test:e2e` runs green; deliberately reverting a mitigation turns the
matching `reproduce.spec.ts` red.

### T2 · `test/unit` never runs, and is red when it does — **P0 · S**

**Verified**: `test:unit` is `bun vitest --dir src`, so `test/unit/host.test.ts` is silently
excluded. Run it directly and both cases fail: it imports `ALLOWED_CAPABILITIES` from `@src/host`,
but `host.ts` only *imports* that symbol from `./csp-directives` (`src/host.ts:2`) and never
re-exports it, so the value is `undefined`.

This is the deny-list test that guards findings 01, 02 and 05 — the ones that all root-cause to
`allow-same-origin`. It has been asserting nothing.

**Work**: widen the vitest scope to include `test/unit`, and either re-export the constant from
`host.ts` or import it from `@src/csp-directives`. Decide deliberately, since it is public API.

**Acceptance**: `bun run test:unit` collects both directories and is green; deleting the filter
in `setConfig()` (`src/host.ts:70`) turns it red.

### T3 · `bun test` and `bun run build` fail on stale paths — **P0 · S**

**Verified**, four dead paths:

| Path | Referenced from | Reality |
| :--- | :--- | :--- |
| `research/playwright.config.ts` | `package.json` `test:e2e` | no `research/` dir; config is at repo root |
| `bun vendor/lofi-web-sandbox/index.ts` | `playwright.config.ts:30` `webServer.command` | no `vendor/` dir |
| `http://localhost:4444` | `playwright.config.ts:31` `webServer.url` | 404s; the served page is `/playground/index.html` |
| `playground/virtual-files-demo.html` | `build.ts:38` | replaced by `playground/index.html` |

**Work**: point `test:e2e` at the root config, set `webServer.command` to `bun run dev` and
`webServer.url` to the playground, and fix `build.ts`. Note `playwright.config.ts` uses
`testDir: "test"`, which also sweeps up the vitest file from T2 — scope it to `test/e2e`.

**Acceptance**: `bun test` runs unit **and** e2e from a clean checkout; `bun run build` completes.

### T4 · Presets are not wired into the tests — **P1 · M**

The README's stated USP is *"Use the same Preset definitions for both manual testing (Playground)
and automated regression testing"*.

**Verified**: `src/lib/presets.ts` defines 18 presets covering findings 01–10 — and
`playground/playground.ts` is the only file that imports it. No test references presets; the
specs hard-code their payloads. The unification is documented but not built.

**Work**: drive the e2e regression specs from `PRESETS`, so a new attack vector is added once.

**Acceptance**: each `reproduce.spec.ts` sources its payload and rules from a preset id; adding a
preset without a spec fails a coverage assertion.

---

## S · Security & Correctness

### S1 · Worker mode escapes the sandbox CSP — **P0 · S**

**Verified**: `spawnWorker()` builds a `blob:` URL and calls `new Worker()` on the *host* document
(`src/host.ts:206–210`), so the worker inherits the host origin and host CSP — not the sandbox
policy. `initialize()` skips iframe creation entirely in worker mode (`src/host.ts:195`). The code
says so at `src/host.ts:196`:

> `// TODO: this is wrong! we need to place the worker inside the iframe, oterwise the worker has full network access (has host CSP policy)`

`COMPETITOR_ANALYSIS_2.md` lists headless mode as a differentiator, and
`test/e2e/worker-security.spec.ts` claims to assert it — but per T1 that spec has never run.

**Work**: always create the iframe; spawn the worker from inside it so it inherits the opaque
origin and injected CSP; route the `MessagePort` handshake through the frame.

**Acceptance**: worker-mode `fetch` to a domain absent from `connectionsAllowed` is blocked, and
`importScripts` of an external URL fails — asserted in a *running* spec.

### S2 · CSP injection into user HTML is regex-based and untested — **P1 · M**

**Verified**: `createIframe()` inserts the `<meta>` CSP by string-replacing `<head>` or the
`<html…>` tag (`src/host.ts:267–271`), guarded only by `unsafeContent.toLowerCase().includes('<html')`.
Two of the repo's own TODOs sit on those lines (`src/host.ts:261`, `:265`):

> `// TODO: is this secure enough for user provided content? Could user-content contain some trick to avoid having this inserted?`

Concrete concerns: content containing `<html` inside a comment, a string or an attribute takes the
wrong branch; a document with an uppercase or attribute-bearing `<HEAD lang=…>` misses the `<head>`
branch and gets a second `<head>` injected; content preceded by a `<!doctype>` plus leading markup
can shift the meta tag after a script.

**Work**: replace regex splicing with a parse-then-serialize step, or prepend the security block
before any user content and assert the parsed result. Fuzz it against hostile inputs.

**Acceptance**: a spec asserting `document.querySelector('meta[http-equiv]')` is the first head
child across a corpus of malformed documents, including the failing cases above.

### S3 · The session id is readable by sandboxed code — **P1 · S**

**Verified**: with virtual files enabled, the session UUID is embedded in the `<base href>`
(`src/host.ts:228`, `:257`). `sw.ts` treats that id as a capability token — *"possession of the
URL implies access rights"* (`src/virtual-files/sw.ts:44-46`) — but the sandbox can read its own
`<base>` and exfiltrate it wherever CSP permits. The TODO at `src/host.ts:227` asks the same
question.

**Work**: either stop treating the id as a secret and add an origin/mode check in the SW fetch
handler, or rotate per load and keep the mapping host-side. Document which model is in force.

**Acceptance**: a spec showing another sandbox instance cannot read the first instance's files
even when handed its session id.

### S4 · `scriptUnsafe` has no guard rail — **P1 · S**

**Verified**: `scriptUnsafe: true` appends `'unsafe-eval'` to `script-src` (`src/host.ts:246`)
with no warning at any level; the TODO at `src/host.ts:9` asks for one. It is enabled in most
presets and in every e2e spec, so it is the path of least resistance for a copy-paste consumer.

**Work**: a one-time console warning when enabled, and a prominent README note that it exists for
testing. **Acceptance**: enabling it emits exactly one warning per instance.

### S5 · No CSP violation reporting — **P2 · M**

`test/e2e/security.spec.ts:29` records the gap in a comment: *"lofi-sandbox doesn't have CSP
violation reporting hooked up to postMessage yet"*. Tests must therefore assert the *absence* of a
success log with a 2s timeout — slow and prone to false green.

**Work**: listen for `securitypolicyviolation` inside the sandbox and forward it over the port as
a first-class event. **Acceptance**: a blocked request produces an observable `violation` event on
the host, and the security specs assert on it directly.

### S6 · No execution budget in iframe mode — **P2 · M**

**Verified**: `workerExecutionTimeout` is enforced only when `mode === 'worker'`
(`src/host.ts:136`). A busy loop in iframe mode blocks the host's main thread with no recourse,
and nothing caps allocation in either mode. See [`RESOURCE_QUOTAS.md`](research/RESOURCE_QUOTAS.md).

**Work**: pair with B2's watchdog; recreate the frame on timeout; sample
`performance.measureUserAgentSpecificMemory()` where available.

**Acceptance**: an infinite loop and an allocation bomb are both terminated instead of hanging or
crashing the tab.

---

## B · API Surface & DX

### B1 · Promise-based RPC in both directions — **P1 · M**

*Parity gap*: `websandbox` (`connection.remote.fn()`), Penpal and Zoid all offer this; we do not.

**Verified**: `execute(code)` is fire-and-forget (`src/host.ts:119`); the in-sandbox script runs
`new Function(code)` and discards the return value (`src/lib/in-sandbox-script.ts:15`). Only `LOG`
frames travel back, so a caller cannot await a result and a thrown error arrives as a log line
rather than a rejected promise. The transport for this already exists — it is the framing that is
missing.

**Work**: a correlated `{id, type, payload}` envelope over the existing port; `sandbox.call(name,
...args): Promise<T>` on the host and a symmetric `host.call()` inside; keep `execute()` as the
`scriptUnsafe`-gated escape hatch.

**Acceptance**: `await sandbox.call('sum', 1, 2) === 3`; a sandbox-side throw rejects with the
original message; identical behaviour in both modes.

### B2 · Lifecycle: `terminate()`, `reset()`, state — **P1 · M**

**Verified**: teardown is private (`initialize()`, `_cleanupWorker()`); consumers have no
supported way to stop a runaway sandbox or to observe its state.

**Work**: public `terminate()` / `reset()`, a readonly state
(`idle → initializing → ready → running → terminated`), and the watchdog S6 needs. Supersedes the
state-machine sketch in `IMPROVEMENTS.md` §4 without the XState dependency.

**Acceptance**: `reset()` yields a fresh opaque origin; `terminated` fires exactly once.

### B3 · Per-instance events — fixes a live defect — **P1 · S**

**Verified**: logs dispatch on `window` (`src/host.ts:139`, `:156`, `:212`) while
`SandboxDevTools` filters `if (e.target !== this._sandbox) return;` (`src/devtools.ts:13`). The
target is always `window`, so **the filter drops every log and DevTools shows nothing**. Two
sandboxes on one page are also indistinguishable — which is why the playground listens globally
(`playground/playground.ts:78`) and why `test/e2e/local-html.spec.ts:30` works around it.

**Work**: dispatch `log` / `error` / `violation` / `terminated` on the element; keep a documented
opt-in global mirror for the playground.

**Acceptance**: with two sandboxes mounted, each receives only its own logs; DevTools output is
covered by a test.

### B4 · The library never registers its element — **P1 · S**

**Verified**: `customElements.define("lofi-sandbox", LofiSandbox)` appears only in
`playground/playground.ts:4`. A consumer importing the built bundle gets a class and an inert
`<lofi-sandbox>` tag with no hint that registration is theirs to do — and it is documented nowhere.

**Work**: export a `defineSandbox(tagName?)` helper that is idempotent; document it. Do not
auto-register on import — that would break consumers who want their own tag name.

**Acceptance**: the D1 smoke test mounts a working sandbox using only the public entry point.

### B5 · Host-mediated `sandbox.fetch` bridge — **P2 · M**

*Parity gap*: Zoid's strict bridge. *Motivated by* [finding 04](research/04_websocket_bypass/README.md)
(WebSockets bypass any SW-level logging) and [finding 09](research/09_monkey_patch_bypass/README.md)
(monkey-patching `fetch` is trivially undone).

**Current state**: no bridge. CSP controls *whether* a request is allowed but yields no record of
it, so the host has no traffic log.

**Work**: per `IMPROVEMENTS.md` §2 — expose `sandbox.fetch` over the port, default to
`connect-src 'none'` in bridged mode, polyfill `globalThis.fetch` onto it. Document the trade-off:
libraries reaching for a raw socket break, deliberately.

**Acceptance**: every sandbox-initiated request appears in a host-side log; a direct `WebSocket`
is refused by CSP in bridged mode.

### B6 · Content auto-sizing — **P2 · S**

*Parity gap*: the headline feature of `cross-origin-html-embed`; Zoid ships it too.
**Verified**: the iframe is pinned to `width:100%;height:100%` (`src/host.ts:224`).
**Work**: a `ResizeObserver` inside the sandbox reporting `scrollHeight` over the port, opt-in via
`autoResize`. **Acceptance**: host element height tracks content within one frame.

---

## C · Virtual Files

### C1 · In-sandbox VFS API — **P1 · M**

**Verified**: one-way only. The host pushes with `registerFiles()` (`src/host.ts:92`); sandboxed
code can *load* files through the `<base>` tag but cannot list, read or write them.
[`RESEARCH_VFS_ACCESS.md`](research/RESEARCH_VFS_ACCESS.md) specifies the API; it is unimplemented.
`test/e2e/virtual-files.spec.ts:19` notes the same absence.

**Work**: implement the research doc's message-bridge option as `sandbox.fs.read/write/list`,
mediated by the host so policy stays on the trusted side.

**Acceptance**: sandboxed code writes a file, reads it back, and the host sees `fileschanged`.

### C2 · MIME types and binary files — **P1 · S**

**Verified**, two defects in `src/virtual-files/sw.ts`: every response is served as
`text/javascript` (`sw.ts:61`, marked `// TODO: Proper MIME`), and `fileCache` is a
`Map<string, string>` written with `content as string` (`sw.ts:2`, `:29`) although
`registerFiles()` advertises `Record<string, string | Uint8Array>` (`src/host.ts:92`). **Binary
registration is broken at the type boundary**, and CSS or images served as JavaScript are rejected
by strict MIME checking.

**Work**: extension→MIME resolution; store `string | Uint8Array` and build the `Response` from the
stored type. **Acceptance**: the SVG and CSS in `playground/test-assets/` load inside the sandbox,
asserted in `test/e2e/virtual-files-real.spec.ts`.

### C3 · File lifecycle and eviction — **P2 · S**

*The lesson of [finding 08](research/08_session_exhaustion/README.md), applied client-side.*
**Verified**: `fileCache` grows without bound and is never pruned (`sw.ts:2`); entries keyed by a
dead session id outlive the sandbox for the Service Worker's lifetime.

**Work**: `unregisterFiles()` / `clearSession()`, drop a session's keys on terminate, cap bytes per
session. **Acceptance**: terminating a sandbox releases its VFS entries.

### C4 · Service Worker update integrity — **P2 · M**

Adopt the main-thread pre-registration verification and versioned SW paths from
[`SW-verify-before-update.md`](research/SW-verify-before-update.md).
**Acceptance**: a modified SW payload fails verification and is not registered.

---

## D · Packaging & Distribution

### D1 · Ship an installable package — **P0 · S**

Every solution we compare against installs with one command. We do not install at all, which caps
adoption regardless of how good the isolation is.

**Verified in `package.json`**: `"private": true`; `"main": "dev-server.ts"` — **a file that does
not exist**; no `exports`, no `types`; `build-dist` emits JS without declarations. `README.md`
also documents a `server.ts` that does not exist (the dev server is a Vite plugin in
`vite.config.ts`).

**Work**: drop `private`, add `exports` + `types` with declaration emit, fix `main`, align the
README with the real entry points.

**Acceptance**: a packed tarball imports cleanly in a scratch project with working types, and a
smoke test mounts a sandbox through the public entry point (with B4).

### D2 · CI — **P1 · S**

**Verified**: `playwright.config.ts` defines chromium, firefox and webkit projects and
[`BROWSER_COMPATIBILITY.md`](research/BROWSER_COMPATIBILITY.md) makes claims about all three — but
there is no `.github/` directory, so nothing runs on merge. This is what allowed T1–T3 to rot
undetected.

**Work**: a workflow running unit + e2e (+ `tsc --noEmit` once H3 lands) on push and PR.
**Acceptance**: reverting any mitigation fails the PR. Order this immediately after T1–T3, or the
same drift recurs.

### D3 · API reference and adapters — **P3 · M**

Document the public surface once B1–B4 stabilise it; thin React/Vue wrappers around the element.
**Acceptance**: a consumer can integrate from the docs without reading `host.ts`.

---

## H · Repo & Docs Hygiene

### H1 · Duplicate documents — **P2 · S**

**Verified byte-identical pairs**:
- `docs/research/VIRTUAL_FILES_SECURITY_ANALYSIS.md` ≡ `docs/research/Virtual-Files-Security-Architecture.md`
- `docs/Sandbox_Architecture_Decision.md` ≡ `docs/research/ARCHITECTURE_COMPARISON.md`

Plus heavy overlap between `VFS_ARCHITECTURE.md`, `VIRTUAL_FILES_PLAN.md` and
`RESEARCH_VFS_ACCESS.md`. **Work**: keep one of each pair, leave a stub pointing at it.

### H2 · Naming drift — **P2 · S**

Four names for one project across README, docs and code: `lofi-sandbox` (the element, 27×),
`lofi-web-sandbox` (the package, 7×), `iframe-sandbox` (older docs, 8×) and "Lofi Sandbox" (prose).
The README opens with "Web Sandbox" and then calls it "Lofi Sandbox" one line later.
**Work**: pick one, sweep the docs, keep the element name distinct and documented as such.

### H3 · Type check is not part of the build — **P2 · S**

**Verified**: `bun x tsc --noEmit` reports 91 errors — 84 in `playground/playground.ts` (untyped
`window.*` globals, unasserted `querySelector`), 6 in `sw.ts` (needs `lib: ["WebWorker"]`), and one
real bug: `src/lib/csp/csp-generator.test.ts:2` imports `CSPDirectives` from `./csp-generator`,
which does not export it. `src/host.ts` itself is clean. `tsconfig.json` also excludes `test/**`
from `include`, and `baseUrl` is deprecated for TS 7.

**Work**: type the playground's window surface, split a worker tsconfig for `sw.ts`, fix the test
import, include `test/`, replace `baseUrl` with relative paths. **Acceptance**: `tsc --noEmit` is
clean and runs in CI.

### H4 · Research index is 30% complete — **P3 · S**

`docs/research/README.md` links 3 of the 10 finding directories. **Work**: list all ten with a
one-line status (mitigated / open / not applicable to the current architecture) — several findings
predate the `srcdoc` refactor and no longer describe the shipped design.

### H5 · Missing repo basics — **P3 · S**

No `LICENSE`, no `CONTRIBUTING.md`, and `.prettierrc` exists with no `format` script and no
formatting check. **Work**: add a license (blocks D1 — publishing without one is a non-starter),
a short contributing note, and `format` / `format:check` scripts.

---

## Parity Reference

Where the items above come from. Legend: ✅ shipped · 🟡 partial · ❌ missing · ➖ n/a by design.

| Capability | lofi-web-sandbox | websandbox | Penpal | Zoid | cross-origin-embed |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Isolation with no server config | ✅ opaque origin | 🟡 | ➖ | ➖ | ❌ wildcard DNS |
| Private `MessageChannel` | ✅ | ❌ | 🟡 | ✅ | ❌ |
| Promise-based RPC | ❌ **B1** | ✅ | ✅ | ✅ | ➖ |
| Typed package / `d.ts` | ❌ **D1** | ✅ | ✅ | ✅ | ✅ |
| Headless (worker) execution | 🟡 **S1** | ❌ | ❌ | ❌ | ❌ |
| Virtual files | 🟡 **C1–C3** | ❌ | ➖ | ❌ | ❌ |
| Host-mediated network | ❌ **B5** | ❌ | ➖ | ✅ | ❌ |
| Auto-sizing | ❌ **B6** | ❌ | 🟡 | ✅ | ✅ |
| Execution quotas | 🟡 **S6** | ❌ | ➖ | ❌ | ➖ |

The two columns where we lead — isolation without server config, and the private channel — are the
ones the backlog must not regress.

Larger bets that follow from the same comparison, both **P3**: an **opt-in hosted unique-origin
mode** (`<uuid>.sandbox.tld`, as `cross-origin-html-embed` and CodeSandbox do) for consumers who
need real storage and Service Workers *inside* the sandbox, keeping local-first as the default; and
a **timeboxed spike on `quickjs-emscripten`** for a no-DOM, VM-grade tier in the manner of Figma's
plugin sandbox — output a recommendation, not code.

---

## Rejected / Out of Scope

| Proposal | Source | Why not |
| :--- | :--- | :--- |
| Wildcard DNS + SSL as the **default** | `cross-origin-html-embed` | Destroys the local-first property, the one thing no competitor offers. Opt-in only. |
| Iframe-scoped Service Worker ("hub" model) | Considered internally | Needs a sandbox origin that can register SWs, re-opening privilege escalation. See [`ARCHITECTURE_COMPARISON.md`](research/ARCHITECTURE_COMPARISON.md). |
| `allow-same-origin` for API compatibility | `websandbox` | Root cause of findings 01, 02 and 05. Enforced by T2's deny-list test. |
| Agent runtime in the trusted base | [`RESEARCH_SANDBOXING.md`](research/RESEARCH_SANDBOXING.md) | Keep the base dumb; agents load as user code so their bugs stay inside the sandbox. |
| Nonce-based CSP instead of `'unsafe-inline'` | General best practice | No benefit under an opaque origin with immutable `srcdoc` CSP — [`CSP_CONFIG_RATIONALE.md`](CSP_CONFIG_RATIONALE.md) §3. |
| Server-side session quotas (rate limit, TTL, LRU) | [Finding 08](research/08_session_exhaustion/README.md), `IMPROVEMENTS.md` §1 | The local-first architecture has no server. Becomes P1 the moment a hosted mode ships; recorded so the requirement is not lost with the server that was removed. |

---

## Already Done

So `IMPROVEMENTS.md` is not re-proposed wholesale:

- **`MessageChannel` communication** (§3) — `setupChannel()` (`src/host.ts:150`), both modes.
- **CSP generation from typed config** — `src/lib/csp/csp-generator.ts`, hardened with a
  `default-src 'none'` fallback and 12 passing unit tests.
- **Opaque origin via `srcdoc`** — closes findings 03 and 05 by construction.
- **Headless worker mode** — API shipped; **isolation is not yet real**, see S1.

---

## Suggested Order

| Milestone | Items | Why in this order |
| :--- | :--- | :--- |
| **M1 · Turn the lights on** | T1, T2, T3, D2 | Until the suite runs, no security claim is verified and no later change is safe. CI belongs here so the same drift cannot recur. |
| **M2 · Make the claims true** | S1, D1, B3, B4 | A documented capability that does not hold (S1) or does not install (D1) costs more than a missing one. B3/B4 ride along — DevTools is silent and the element self-registers nowhere. |
| **M3 · Harden** | S2, S3, S4, T4, H3 | The injection path and the session-id model are the two places where the design's assumptions are unverified; presets and type checking keep them that way. |
| **M4 · Make it adoptable** | B1, B2, C1, C2 | RPC + lifecycle is the parity bar set by websandbox and Penpal; the VFS is the differentiator, so it must actually work. |
| **M5 · Extend** | B5, B6, C3, C4, S5, S6, D3, H1, H2, H4, H5 | Observability, quotas, docs and hygiene once the base is trustworthy. |
| **Bets** | hosted-origin mode, QuickJS spike | Independent; run when there is slack. |
