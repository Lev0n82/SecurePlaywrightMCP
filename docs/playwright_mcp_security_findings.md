# Playwright MCP Security Audit — Comprehensive Findings

**Audit Date:** March 1, 2026  
**Auditor:** AUTONOMOUS.ML Security Team  
**Scope:** `@playwright/mcp@0.0.68` and all transitive dependencies  
**Methodology:** Source code review, dependency vulnerability scanning (npm audit, Snyk CLI v1.1303.0 authenticated, retire.js v5.4.2, OSV database), MCP protocol analysis, and attack surface mapping  
**Snyk Project:** https://app.snyk.io/org/lev0n82/project/db916f09-1d3f-4970-8c20-a0d286b82568  
**Repository:** https://github.com/microsoft/playwright-mcp  
**Playwright Core:** https://github.com/microsoft/playwright (monorepo, MCP at `packages/playwright/src/mcp/`)

---

## Executive Summary

This audit assessed the security posture of `@playwright/mcp` for enterprise deployment in the AUTONOMOUS.ML CPU Agents for SDLC Phase 4.1 architecture. The package is **legitimate, open-source software with a clean binary profile and no malicious code**. However, the audit identified **3 confirmed CVEs** in its dependency tree (independently verified by both npm audit and authenticated Snyk CLI scan), **6 critical architectural security concerns** in the MCP protocol implementation, and **1 undocumented process termination endpoint** that constitutes a significant operational security risk.

The overall risk rating is **HIGH** for unauthenticated network deployments and **MEDIUM** for localhost-only deployments with proper network segmentation.

---

## 1. Repository and Architecture Analysis

### 1.1 Structural Finding: MCP Is Embedded in Playwright Core

The most significant architectural discovery is that the MCP implementation is **not contained within the `playwright-mcp` npm package itself**. The `@playwright/mcp` package is a thin launcher that delegates all MCP tool logic to the Playwright core monorepo at:

```
packages/playwright/src/mcp/
├── browser/
│   └── tools/          ← 30 tool modules (8,002 lines TypeScript)
│       ├── evaluate.ts     ← Arbitrary JavaScript execution
│       ├── runCode.ts      ← Node.js vm sandbox execution
│       ├── files.ts        ← File system access
│       ├── network.ts      ← Network request inspection
│       ├── route.ts        ← Network request interception/modification
│       ├── cookies.ts      ← Full cookie read/write/delete
│       ├── webstorage.ts   ← localStorage/sessionStorage access
│       ├── navigate.ts     ← URL navigation
│       ├── screenshot.ts   ← Screen capture
│       └── pdf.ts          ← PDF generation
├── sdk/
│   ├── http.ts         ← HTTP/SSE/Streamable transport server
│   └── server.ts       ← MCP server lifecycle
└── extension/          ← Chrome DevTools Protocol relay
```

**Security implication:** Auditing `@playwright/mcp` alone is insufficient. The full Playwright monorepo must be audited to assess the complete attack surface.

### 1.2 Dependency Profile

```
@playwright/mcp@0.0.68
├── playwright-core@1.59.0-alpha-1771104257000   ← Alpha build (risk)
└── playwright@1.59.0-alpha-1771104257000
    └── playwright-core (deduped)
```

| Metric | Count |
|---|---|
| Total unique packages | 249 |
| Production packages | 9 |
| Dev packages | 235 |
| Optional packages (browser binaries) | 53 |

---

## 2. Dependency Vulnerability Scan

### 2.1 Scan Methodology

Four scanning approaches were executed:

| Tool | Method | Auth | Result |
|---|---|---|---|
| `npm audit` | GitHub Advisory Database (GHSA) | None required | 3 vulnerabilities found |
| **Snyk CLI v1.1303.0** | Snyk vulnerability database | ✅ Authenticated (org: lev0n82) | **3 vulnerabilities confirmed** |
| `retire.js v5.4.2` | RetireJS vulnerability database | None required | 0 additional findings |
| OSV Database API | Open Source Vulnerabilities database | None required | Confirmed all 3 findings |

**Snyk scan command executed:**
```bash
snyk test --json --dev --package-manager=npm --file=package.json
```

**Snyk monitor:** Results uploaded to https://app.snyk.io/org/lev0n82/project/db916f09-1d3f-4970-8c20-a0d286b82568 for continuous monitoring. Future CVEs against these dependencies will trigger automated alerts.

**Snyk scan summary:** 189 dependencies scanned, 5 vulnerability instances found (3 unique CVEs, 2 appearing in multiple dependency paths), 0 critical severity.

**Note on OWASP Dependency-Check:** The tool requires a one-time NVD database download (~1.5 GB). The OSV API provides equivalent coverage for the npm ecosystem and was used in its place.

### 2.2 Confirmed Vulnerabilities

#### CVE-1: GHSA-mw96-cpmx-2vgc — Rollup Arbitrary File Write (HIGH)

| Field | Value |
|---|---|
| **Package** | `rollup@4.57.1` (direct dev dependency) |
| **CVE** | CVE-2026-27606 |
| **Snyk ID** | SNYK-JS-ROLLUP-15340920 |
| **CVSS v3 (Snyk)** | 8.5 (HIGH) — `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N` |
| **Published** | 2026-02-25 |
| **Fixed in** | rollup@4.59.0 |
| **Description** | Insecure file name sanitization in Rollup's core engine allows an attacker to control output filenames via CLI named inputs, manual chunk aliases, or `output.entryFileNames`/`output.chunkFileNames` configuration, enabling path traversal to write files outside the intended output directory. |
| **Exploitability in playwright-mcp** | **Dev-time only** — affects the build process, not the runtime MCP server. |
| **Remediation** | Upgrade to `rollup@4.59.0` or later. |

#### CVE-2: GHSA-2g4f-4pwh-qvx6 — ajv ReDoS (HIGH per Snyk)

| Field | Value |
|---|---|
| **Package** | `ajv@8.17.1` (transitive via `@modelcontextprotocol/sdk@1.26.0`) |
| **CVE** | CVE-2025-69873 |
| **Snyk ID** | SNYK-JS-AJV-15274295 |
| **CVSS v3 (Snyk)** | 8.2 (HIGH) — `CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:H` |
| **Published** | 2026-02-11 |
| **Fixed in** | ajv@8.18.0 |
| **Description** | When the `$data` option is enabled in ajv, the `pattern` keyword accepts runtime data via JSON Pointer syntax and passes it directly to the JavaScript `RegExp()` constructor without validation. A crafted regex pattern can cause catastrophic backtracking (ReDoS). |
| **Exploitability in playwright-mcp** | **Not exploitable** — the `$data` option is disabled in all MCP tool schemas. |
| **Remediation** | Upgrade to `ajv@8.18.0` or later. |

#### CVE-3: GHSA-gq3j-xvxp-8hrf — Hono Timing Attack (MEDIUM per Snyk)

| Field | Value |
|---|---|
| **Package** | `hono@4.11.8` (transitive via `@modelcontextprotocol/sdk@1.26.0`) |
| **Snyk ID** | SNYK-JS-HONO-15322749 |
| **CVSS v3 (Snyk)** | 6.3 (MEDIUM) — `CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N` |
| **Published** | 2026-02-19 |
| **Fixed in** | hono@4.11.10 |
| **Description** | The `basicAuth` and `bearerAuth` middlewares in Hono used non-constant-time string comparison, theoretically leaking credential information through timing side-channels. |
| **Exploitability in playwright-mcp** | **Not exploitable** — Playwright MCP does not use Hono's auth middleware. Hono is used for HTTP routing only. |
| **Remediation** | Upgrade to `hono@4.11.10` or later. |

### 2.3 Vulnerability Summary

**Snyk scan:** 189 dependencies scanned across 4 sub-projects | 5 vulnerability instances | 3 unique CVEs | 0 critical

| Snyk Severity | npm audit Severity | Package | Snyk CVSS | Directly Exploitable |
|---|---|---|---|---|
| HIGH | HIGH | rollup@4.57.1 | 8.5 | No (dev-time only) |
| HIGH | MODERATE | ajv@8.17.1 | 8.2 | No ($data option not used) |
| MEDIUM | LOW | hono@4.11.8 | 6.3 | No (auth middleware not used) |
| **Total: 3** | | | | **0 directly exploitable** |

> Snyk rates ajv and hono higher than npm audit because Snyk applies contextual CVSS scoring that accounts for network reachability and default configurations across all possible deployment scenarios, not just the specific playwright-mcp usage pattern.

### 2.4 Retire.js Scan Results

```json
{
  "version": "5.4.2",
  "start": "2026-03-01T14:46:12.813Z",
  "data": [],
  "messages": [],
  "errors": [],
  "time": 8.735
}
```

No known vulnerable JavaScript libraries detected in the `playwright-mcp` source tree or `node_modules`.

---

## 3. Binary and Install Script Assessment

### 3.1 Source Code Binary Scan

A complete scan of all non-`node_modules` files was performed:

- No binary files in source (excluding node_modules)
- No minified or obfuscated JavaScript
- No `eval()` or `Function()` usage in MCP source
- No `preinstall`/`postinstall` scripts in MCP packages
- One WASM file found: `tests/assets/wasm/table2.wasm` — test asset only, not production

### 3.2 Install Script Analysis

Six browser install scripts were identified in `playwright-core`. These scripts download browser binaries from Microsoft CDN (`playwright.azureedge.net`) during `npm install`. The download URLs are hardcoded with specific build numbers, providing implicit version pinning.

**Risk:** CDN compromise or BGP hijacking could substitute malicious browser binaries. SHA256 verification is not performed by default.

**Mitigation:** Set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` and manually install verified browser binaries with SHA256 checksum verification.

### 3.3 Alpha Build Risk

The current `playwright-mcp` package depends on `playwright@1.59.0-alpha-1771104257000`. Alpha builds may contain unpatched security vulnerabilities, are not covered by the standard security advisory process, and may change APIs without notice.

**Recommendation:** Wait for a stable release before enterprise deployment, or pin to the most recent stable `playwright@1.50.x` release.

### 3.4 Comparison to xz Backdoor (CVE-2024-3094)

| Aspect | xz Backdoor | Playwright MCP |
|---|---|---|
| Hidden code | Obfuscated in test files | ✅ Clean, auditable TypeScript |
| Binary payload | Malicious .o files in tests | ✅ No suspicious binaries |
| Install scripts | Modified build scripts | ⚠️ Browser download scripts (CDN) |
| Maintainer trust | Single maintainer compromised | ✅ Microsoft Corporation |
| Code complexity | Intentionally obfuscated | ✅ Well-documented, readable |
| Detection | Valgrind slowdown | ✅ No anomalous behavior |

**Conclusion:** Playwright MCP is **legitimate, open-source software**. The xz backdoor was intentionally malicious with obfuscated payloads. These are not comparable in intent or execution.

---

## 4. MCP Protocol Security Analysis

### 4.1 Transport Layer

The MCP server supports three transport modes:

| Transport | Protocol | Authentication |
|---|---|---|
| stdio | stdin/stdout | Inherits process security; no network exposure |
| SSE (Server-Sent Events) | HTTP GET + POST | **None** — host header check only |
| Streamable HTTP | HTTP POST | **None** — host header check only |

### 4.2 Critical Finding: No Authentication on HTTP Transports

The HTTP server implementation in `sdk/http.ts` has **no authentication mechanism of any kind**. The only access control is host-based validation:

```typescript
// sdk/http.ts — the complete access control implementation
allowedHosts = (allowedHosts || [host]).map(h => h.toLowerCase());
const allowAnyHost = allowedHosts.includes('*');

httpServer.on('request', async (req, res) => {
  if (!allowAnyHost) {
    const host = req.headers.host?.toLowerCase();
    if (!host) { res.statusCode = 400; return res.end('Missing host'); }
    if (!allowedHosts.includes(host)) {
      res.statusCode = 403;
      return res.end('Access is only allowed at ' + allowedHosts.join(', '));
    }
  }
  // No further authentication — full tool access granted
```

There is no bearer token, API key, session cookie, or any other credential verification. Any request that passes the host header check is granted full access to all 30 MCP tools.

**Risk:** If the MCP server is exposed beyond localhost, any network-reachable client can execute arbitrary JavaScript in the browser, read all cookies and storage, intercept network traffic, and upload files.

### 4.3 Undocumented Process Termination Endpoint

The HTTP server exposes an **unauthenticated kill endpoint** that is not documented in the official README or CLI help:

```typescript
// sdk/http.ts — undocumented endpoint
if (url.pathname === '/killkillkill' && req.method === 'GET') {
  res.statusCode = 200;
  res.end('Killing process');
  process.emit('SIGINT');
  return;
}
```

Any HTTP client that can reach the MCP server can send `GET /killkillkill` to immediately terminate the Node.js process. In CI/CD environments where the MCP server is a shared resource, this constitutes a denial-of-service vector.

### 4.4 Code Execution Tools

#### `browser_evaluate` — Arbitrary JavaScript in Browser Context

```typescript
// evaluate.ts — no sanitization of the function parameter
handle: async (tab, params, response) => {
  if (!params.function.includes('=>'))
    params.function = `() => (${params.function})`;
  const result = await receiver._evaluateFunction(params.function);
```

This tool executes arbitrary JavaScript in the browser page context with access to all DOM content, cookies (non-HttpOnly), localStorage, sessionStorage, and the ability to make network requests from the page origin. There is no allowlist of permitted operations, no sandboxing beyond the browser's own security model, and no audit logging.

**Prompt injection risk:** If an AI agent is directed to a malicious web page, that page can embed instructions in its DOM content that cause the agent to call `browser_evaluate` with attacker-controlled JavaScript.

#### `browser_run_code` — Node.js vm Module (NOT a Security Sandbox)

```typescript
// runCode.ts — uses Node.js vm module
const context = { page: tab.page, __end__ };
vm.createContext(context);
await vm.runInContext(snippet, context);
```

**Critical Finding:** The Node.js `vm` module is **explicitly documented as not a security sandbox**. From the official Node.js documentation: *"The vm module is not a security mechanism. Do not use it to run untrusted code."* A `vm.createContext()` sandbox can be escaped using standard JavaScript prototype chain techniques, giving the attacker full access to the Node.js process, the file system, and the host operating system.

**Conceptual proof of concept:**
```javascript
// Standard Node.js vm sandbox escape via constructor chain
const escape = this.constructor.constructor('return process')();
escape.mainModule.require('child_process').execSync('id > /tmp/pwned');
```

### 4.5 File System Access

```typescript
// files.ts — no path validation on uploaded file paths
handle: async (tab, params, response) => {
  if (params.paths)
    await modalState.fileChooser.setFiles(params.paths);
```

The `browser_file_upload` tool accepts **absolute file paths** from the MCP client with no validation. An attacker can instruct the MCP server to upload any file accessible to the Node.js process (e.g., `/etc/passwd`, SSH private keys, application configuration files) to any web form.

### 4.6 Network Interception and Modification

The `browser_route` tool allows the MCP client to intercept and modify any HTTP/HTTPS request made by the browser, including modifying headers, bodies, status codes, and blocking requests entirely. An attacker with MCP access can inject arbitrary headers into outbound requests (e.g., adding `Authorization` headers to exfiltrate credentials) or modify response bodies to inject malicious content.

### 4.7 Cookie and Storage Exfiltration via CDP

The `browser_cookies_get` tool provides complete read access to all cookies for any domain the browser has visited, including **HttpOnly cookies** which are normally inaccessible to JavaScript:

```typescript
// cookies.ts — returns all cookies including HttpOnly via CDP
const cookies = await context.cookies(params.urls);
// Returns: name, value, domain, path, expires, httpOnly, secure, sameSite
```

HttpOnly cookies are accessible via Playwright's Chrome DevTools Protocol interface even though they are inaccessible to JavaScript in the page. This means `browser_cookies_get` can exfiltrate session tokens that would normally be protected from XSS attacks.

### 4.8 DNS Rebinding Protection

The `allowedHosts` mechanism correctly validates the `Host` header on every request, providing DNS rebinding protection. However, this protection is bypassed when `--allowed-hosts *` is used, or when the server is bound to `0.0.0.0` without explicit `allowedHosts` configuration.

### 4.9 Wire Format and Session Security

The MCP protocol uses JSON-RPC 2.0 over the transport layer. Key observations:

- **No message signing or integrity verification** — messages can be replayed or modified in transit if TLS is not used
- **No rate limiting** — an attacker can flood the server with tool calls
- **No session expiry** — SSE sessions persist indefinitely until the connection is closed
- **Session IDs are UUIDs** — generated with `crypto.randomUUID()`, which is cryptographically secure

---

## 5. Attack Vectors Mapped

### Attack Chain 1: Supply Chain Compromise

```
npm account takeover (attacker)
  → malicious @playwright/mcp release published to npm
  → enterprise CI/CD uses `npx @playwright/mcp@latest`
  → malicious code executes in CI/CD environment
  → lateral movement to source code, secrets, production systems
```

**Likelihood:** Medium | **Impact:** Critical  
**Mitigation:** Pin to exact version with hash verification; use private npm registry; never use `@latest` in production

### Attack Chain 2: Dependency Confusion

```
Attacker publishes malicious `playwright-core` to public npm registry
  → npm resolves public package over private registry (if misconfigured)
  → malicious playwright-core executes in MCP server process
  → attacker gains Node.js process access
```

**Likelihood:** Low | **Impact:** Critical  
**Mitigation:** Configure `--registry` to private registry with `--no-fallback`; use `npm config set registry` to point exclusively to internal mirror

### Attack Chain 3: vm Sandbox Escape → Host Compromise

```
Malicious prompt injected into web page DOM
  → AI agent reads page content
  → Agent calls browser_run_code with sandbox escape payload
  → vm.createContext() sandbox escaped via prototype chain
  → Attacker gains Node.js process access
  → File system read/write, environment variable access, network access
```

**Likelihood:** Medium | **Impact:** Critical  
**Mitigation:** Disable `browser_run_code` tool; run in Podman rootless container to limit blast radius

### Attack Chain 4: Configuration Exploitation (SSRF)

```
MCP server deployed with --allowed-hosts * or misconfigured
  → Attacker sends browser_navigate to internal service URL
  → Browser navigates to http://169.254.169.254/latest/meta-data/ (AWS metadata)
  → Attacker reads cloud credentials via browser_network_requests
  → Cloud account compromise
```

**Likelihood:** Medium | **Impact:** High  
**Mitigation:** Network egress filtering; block RFC 1918 ranges and cloud metadata endpoints; use `allowedHosts` correctly

### Attack Chain 5: HttpOnly Cookie Exfiltration

```
Attacker gains MCP access (via any of the above chains)
  → Calls browser_cookies_get for target domain
  → Receives all cookies including HttpOnly session tokens
  → Uses session tokens to authenticate as the browser user
  → Account takeover without XSS
```

**Likelihood:** High (if MCP access is obtained) | **Impact:** High  
**Mitigation:** Restrict MCP tool capabilities; disable cookie tools for production deployments; use short-lived session tokens

---

## 6. Risk Classification Summary

| Finding | Severity | Exploitable Default | Fix Available |
|---|---|---|---|
| No authentication on HTTP transport | **CRITICAL** | Yes (if network-exposed) | Requires SecurePlaywrightMCP |
| `browser_run_code` vm sandbox escape | **CRITICAL** | Yes (via prompt injection) | Disable tool |
| Undocumented `/killkillkill` endpoint | **HIGH** | Yes (if network-exposed) | Requires SecurePlaywrightMCP |
| HttpOnly cookie exfiltration via CDP | **HIGH** | Yes (if MCP access obtained) | Disable cookie tools |
| SSRF via `browser_navigate` | **HIGH** | Yes (if misconfigured) | Network segmentation |
| rollup path traversal (CVE-2026-27606) | **HIGH** | No (dev-time only) | Upgrade rollup@4.59.0 |
| File upload with absolute paths | **MEDIUM** | Yes (if MCP access obtained) | Disable file tools |
| Network interception via `browser_route` | **MEDIUM** | Yes (if MCP access obtained) | Disable network tools |
| ajv ReDoS (CVE-2025-69873) | **MODERATE** | No ($data disabled) | Upgrade ajv@8.18.0 |
| Alpha build dependency | **MODERATE** | No | Wait for stable release |
| Hono timing attack (GHSA-gq3j-xvxp-8hrf) | **LOW** | No (auth middleware unused) | Upgrade hono@4.11.10 |

---

## 7. Recommendations

### Immediate Actions (Any Existing Deployment)

1. **Pin exact versions** — Replace `@playwright/mcp@latest` with `@playwright/mcp@0.0.68` (or the specific audited version) in all package.json files. Use `npm ci` instead of `npm install` to enforce lock file integrity.

2. **Private npm registry** — Mirror `@playwright/mcp` and its dependencies to an internal registry (Artifactory, Nexus, Verdaccio). Disable public npm fallback. Scan all packages before mirroring.

3. **Network segmentation** — Run the MCP server in an isolated network zone. Block all outbound traffic by default. Whitelist only the specific domains required for testing. Block RFC 1918 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) and cloud metadata endpoints (169.254.169.254, fd00:ec2::254).

4. **Disable `browser_run_code`** — This tool uses Node.js `vm` which is explicitly not a security sandbox. Remove it from the tool list or use capability flags to exclude it.

5. **Upgrade vulnerable dependencies:**
   - `rollup` → `4.59.0` or later
   - `ajv` → `8.18.0` or later
   - `hono` → `4.11.10` or later

6. **Disable auto-install** — Set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` and manually install browser binaries with verified SHA256 checksums.

### Long-Term Strategy

1. **Deploy SecurePlaywrightMCP** — Use the hardened fork at https://github.com/Lev0n82/SecurePlaywrightMCP which adds mandatory authentication, removes the kill endpoint, disables dangerous tools, and runs in a Podman rootless container with seccomp and SELinux profiles.

2. **SBOM generation** — Generate a Software Bill of Materials on every build using `cyclonedx-npm` or `syft`. Integrate SBOM into the CI/CD pipeline for continuous compliance tracking.

3. **Continuous monitoring** — Configure GitHub Dependabot, Snyk (with authentication), or OWASP Dependency-Check (with pre-populated NVD cache) for automated vulnerability alerts on new CVEs.

4. **Incident response plan** — Document procedures for responding to a compromised MCP server, including: isolating the container, revoking browser session cookies, rotating any credentials that may have been exposed, and forensic log analysis.

---

## 8. References

- [1] GitHub Advisory: GHSA-mw96-cpmx-2vgc — Rollup Arbitrary File Write https://github.com/rollup/rollup/security/advisories/GHSA-mw96-cpmx-2vgc
- [2] GitHub Advisory: GHSA-2g4f-4pwh-qvx6 — ajv ReDoS https://github.com/ajv-validator/ajv/pull/2586
- [3] GitHub Advisory: GHSA-gq3j-xvxp-8hrf — Hono timing attack https://github.com/honojs/hono/security/advisories/GHSA-gq3j-xvxp-8hrf
- [4] Node.js vm module documentation — "The vm module is not a security mechanism" https://nodejs.org/api/vm.html
- [5] Playwright MCP source — sdk/http.ts https://github.com/microsoft/playwright/blob/main/packages/playwright/src/mcp/sdk/http.ts
- [6] Playwright MCP source — browser/tools/runCode.ts https://github.com/microsoft/playwright/blob/main/packages/playwright/src/mcp/browser/tools/runCode.ts
- [7] OSV Database https://osv.dev
- [8] RetireJS https://retirejs.github.io/retire.js/
- [9] CVE-2024-3094 (xz backdoor) https://nvd.nist.gov/vuln/detail/CVE-2024-3094
- [10] SecurePlaywrightMCP — Hardened fork https://github.com/Lev0n82/SecurePlaywrightMCP
