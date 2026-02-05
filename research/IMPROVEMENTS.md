# Roadmap & Improvements

Based on the comparison with other libraries (Zoid, Figma, Penpal) and the recent architectural refactor, here are practical steps to further improve `iframe-sandbox`.

## 1. Solve Session Exhaustion (High Priority)

**Problem**: The current server-side session storage is unbounded and in-memory.
**Lesson**: Robust systems (like Cloudflare Workers) apply strict quotas.

**Action Plan**:
*   **Rate Limiting**: Implement a middleware in `server.ts` to limit `POST /api/session` requests per IP address (e.g., 10/minute).
*   **TTL (Time-To-Live)**: Add a `lastAccessed` timestamp to the `SessionConfig` interface. Run a cleanup interval (garbage collector) every minute to delete sessions older than 5 minutes.
*   **LRU Cache**: Replace the standard `Map` with an LRU (Least Recently Used) cache implementation to enforce a hard memory limit (e.g., max 1000 active sessions).

## 2. Strengthen Network Observability (Medium Priority)

**Problem**: Removing the Service Worker (to support Unique Origins) forced us to use "Monkey Patching" for logging, which is fragile and bypassable (Research 09).
**Lesson**: Zoid uses a strict "Bridge".

**Action Plan**:
*   **Proxy Object**: Instead of patching `window.fetch`, expose a `sandbox.fetch` API that communicates with the host via `postMessage`.
*   **CSP Enforcement**: Set `connect-src 'none'` (except for the Host API). This forces user code to use the provided `sandbox.fetch` bridge, ensuring all traffic is logged and controlled by the Host.
    *   *Trade-off*: This breaks standard libraries that expect global `fetch`. We would need to polyfill `window.fetch` to use our bridge.

## 3. WebAssembly Isolation (Future / High Security)

**Problem**: Iframes share the main thread and rely on DOM security (Same-Origin Policy). Zero-day browser bugs can compromise this.
**Lesson**: Figma uses QuickJS in WebAssembly.

**Action Plan**:
*   **Headless Mode**: Offer a configuration option to run the code in a `Worker` inside the iframe (or just a Worker).
*   **WASM Container**: Explore integrating a JS engine compiled to WASM (like `quickjs-emscripten`). This provides "VM inside a VM" isolation, making breakout virtually impossible without a V8/WASM engine bug.

## 4. Virtual Files & Host Service Worker

**Clarification**: It is **not possible** for a Service Worker on the *Host* origin (`localhost`) to intercept requests for the *Sandbox* origin (`uuid.sandbox.localhost`) due to browser scoping rules.
**Recommendation**: Continue using the Server-Side Virtual File serving mechanism implemented in the refactor. It is secure, simple, and stateless (if backed by a DB/Redis) or session-based (current memory map).

## 5. UI/Transport Separation

**Lesson**: Zoid separates the "Component" definition from the "Rendering".
**Action Plan**: Refactor `SafeSandbox.ts` to separate the "Session Management" (API calls) from the "Iframe Management" (DOM). Create a `SandboxSession` class that can theoretically run headless.
