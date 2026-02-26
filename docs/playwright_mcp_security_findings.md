# Playwright MCP Security Audit - Initial Findings
## Date: February 26, 2026

### Repository Information
- **Source:** https://github.com/microsoft/playwright-mcp
- **License:** Apache-2.0
- **Maintainer:** Microsoft Corporation
- **Latest Version:** 0.0.68
- **Stars:** 27.7k
- **Forks:** 2.2k

### Architecture Overview

**Monorepo Structure:**
```
playwright-mcp/
├── packages/
│   ├── playwright-mcp/        # Main MCP server
│   ├── extension/             # Browser extension
│   └── playwright-cli-stub/   # Deprecated CLI stub
├── .github/workflows/         # CI/CD pipelines
└── Dockerfile                 # Container deployment
```

**Core Implementation:**
- **Entry Point:** `packages/playwright-mcp/index.js`
- **Actual Implementation:** `require('playwright/lib/mcp/index')`
- **Key Finding:** The MCP server is **embedded within Playwright core**, not standalone

### Dependency Analysis

**Direct Dependencies (playwright-mcp package):**
```json
{
  "playwright": "1.59.0-alpha-1771104257000",
  "playwright-core": "1.59.0-alpha-1771104257000"
}
```

**Dev Dependencies (root):**
```json
{
  "@modelcontextprotocol/sdk": "^1.25.2",
  "@playwright/test": "1.59.0-alpha-1771104257000",
  "@types/node": "^24.3.0"
}
```

**Critical Observation:**
- **Minimal direct dependencies** (only 2 production deps)
- **MCP implementation lives in Playwright core** (`playwright/lib/mcp/`)
- **Cannot audit MCP code without accessing Playwright core source**

### Security Features (From Documentation)

**1. Network Security:**
- `--allowed-hosts`: Whitelist allowed network hosts
- `--blocked-origins`: Blacklist specific origins
- `allowedOrigins`: Origin-based access control

**2. File System Security:**
- `--allow-unrestricted-file-access`: Restrict file system access (default: restricted)

**3. Browser Isolation:**
- `--isolated`: Isolated browser profiles to prevent data leakage
- Headless mode reduces UI attack surface

**4. Permissions Management:**
- `--grant-permissions`: Configurable browser permissions

**5. Network Proxy:**
- `--proxy-server`: Proxy configuration
- `--proxy-bypass`: Proxy bypass rules

**6. Secrets Management:**
- Secrets files support
- Environment variable integration

### Security Concerns Identified

#### 🔴 **Critical Risks**

**1. Opaque Implementation**
- MCP server code is **embedded in Playwright core binary**
- Source code not directly auditable in this repository
- Requires deep dive into Playwright monorepo

**2. Dependency on Playwright Alpha Build**
- Using alpha version: `1.59.0-alpha-1771104257000`
- Alpha builds may contain unpatched vulnerabilities
- Not production-stable

**3. Supply Chain Risk**
- `npx @playwright/mcp@latest` downloads code at runtime
- No hash verification in standard installation
- Vulnerable to npm account compromise (similar to OpenSSH backdoor)

**4. Browser as Attack Surface**
- Full browser automation capabilities
- Can execute arbitrary JavaScript in browser context
- Network access to any URL (unless whitelisted)
- File system access (if enabled)

#### 🟡 **Medium Risks**

**5. Transitive Dependencies**
- Playwright core has **extensive** dependency tree
- Need to audit all transitive dependencies
- Potential for deep supply chain attacks

**6. Docker Image Trust**
- Dockerfile pulls from external sources
- Base image security not guaranteed
- Container escape vulnerabilities

**7. Configuration Complexity**
- Many security-relevant configuration options
- Misconfiguration can lead to security holes
- No secure-by-default configuration template

#### 🟢 **Mitigations Present**

**8. Origin Whitelisting**
- Can restrict network access to specific domains
- Reduces SSRF attack surface

**9. Isolated Profiles**
- Browser isolation prevents cross-session data leakage
- Good for multi-tenant scenarios

**10. Apache 2.0 License**
- Permissive license allows forking and modification
- Can create hardened fork if needed

### Attack Vectors

**1. Supply Chain Compromise**
```
Attacker → npm account takeover → Malicious @playwright/mcp release → 
Enterprise installs via npx → RCE
```

**2. Dependency Confusion**
```
Attacker → Publishes malicious playwright-core → 
npm resolves to malicious package → Code execution
```

**3. Browser Exploit Chain**
```
Attacker → Sends malicious URL to MCP server → 
Browser vulnerability → Sandbox escape → Host compromise
```

**4. Configuration Exploitation**
```
Attacker → Exploits misconfigured --allowed-hosts → 
SSRF to internal services → Data exfiltration
```

### Comparison to OpenSSH Backdoor (CVE-2024-3094)

**Similarities:**
- **Hidden implementation** (MCP code in Playwright binary, backdoor in xz library)
- **Supply chain attack vector** (npm for MCP, upstream tarball for OpenSSH)
- **Trusted source** (Microsoft for Playwright, Lasse Collin for xz)

**Differences:**
- **Open source** (Playwright is auditable, xz backdoor was obfuscated)
- **No evidence of malice** (Playwright MCP is legitimate, xz was intentionally backdoored)
- **Active community** (27.7k stars, active development vs single maintainer)

### Recommendations for Enterprise Security

#### Immediate Actions

**1. Audit Playwright Core Source**
- Clone Playwright monorepo: https://github.com/microsoft/playwright
- Locate `lib/mcp/` implementation
- Review all MCP-related code

**2. Dependency Pinning**
- **DO NOT** use `@playwright/mcp@latest`
- Pin exact versions in package.json
- Use lock files (package-lock.json, pnpm-lock.yaml)
- Verify package hashes

**3. Private npm Registry**
- Mirror @playwright/mcp to internal registry
- Scan for vulnerabilities before mirroring
- Control update cadence

**4. Network Segmentation**
- Run MCP server in isolated network zone
- Whitelist only necessary domains
- Block all outbound traffic by default

#### Long-Term Strategy

**5. Hardened Fork**
- Fork Playwright MCP repository
- Remove unnecessary features
- Add additional security controls:
  - Content Security Policy enforcement
  - Request/response logging
  - Rate limiting
  - Anomaly detection

**6. Minimal Dependency Rebuild**
- Reimplement MCP server with minimal dependencies
- Use only:
  - playwright-core (browser automation)
  - @modelcontextprotocol/sdk (MCP protocol)
  - Native Node.js modules (http, fs, crypto)
- Avoid transitive dependencies

**7. Security Hardening**
- Implement mandatory sandboxing (seccomp, AppArmor, SELinux)
- Run in container with read-only filesystem
- Use dedicated service account with minimal privileges
- Enable audit logging for all browser actions

**8. Continuous Monitoring**
- Automated vulnerability scanning (Snyk, Dependabot)
- SBOM (Software Bill of Materials) generation
- Regular security audits
- Incident response plan

### Next Steps for Audit

1. **Clone Playwright monorepo** and locate MCP implementation
2. **Map complete dependency tree** (all transitive dependencies)
3. **Run security scanners** (npm audit, Snyk, OWASP Dependency-Check)
4. **Analyze MCP protocol** for security vulnerabilities
5. **Test attack scenarios** in isolated environment
6. **Document all findings** in comprehensive security report
7. **Design hardened alternative** with minimal attack surface

### Conclusion

Playwright MCP provides useful browser automation capabilities but introduces significant security risks for enterprise environments:

- **Supply chain vulnerabilities** (npm, transitive dependencies)
- **Opaque implementation** (code in Playwright core binary)
- **Broad attack surface** (full browser automation, network access, file system)

**Recommendation:** Do not use Playwright MCP directly in production without:
1. Complete source code audit
2. Dependency pinning and verification
3. Network isolation and whitelisting
4. Continuous security monitoring

**Alternative Approach:** Build hardened MCP alternative with:
- Minimal dependencies (playwright-core only)
- Security-first design
- Comprehensive audit trail
- Enterprise compliance (SOC 2, ISO 27001)

---

## References
- Playwright MCP Repository: https://github.com/microsoft/playwright-mcp
- Playwright Core Repository: https://github.com/microsoft/playwright
- Model Context Protocol Spec: https://modelcontextprotocol.io/
- CVE-2024-3094 (OpenSSH Backdoor): https://nvd.nist.gov/vuln/detail/CVE-2024-3094


---

## Phase 2: Binary and Test Package Security Audit

### Binary File Analysis

**Playwright MCP Repository:**
- ✅ **No binary files found** in source code (excluding node_modules)
- ✅ **No minified/obfuscated JavaScript** in source
- ✅ **No eval() or Function() usage** detected in source files
- ✅ **No install/preinstall/postinstall scripts** in Playwright MCP packages

**Playwright Core Repository:**
- ⚠️ **1 WASM file found:** `./tests/assets/wasm/table2.wasm` (test asset only)
- ⚠️ **Browser install scripts:** 6 packages have `install` scripts that download browser binaries

### Install Script Security Analysis

**Browser Installation Packages:**
```
packages/playwright-browser-chromium/install.js
packages/playwright-browser-firefox/install.js
packages/playwright-browser-webkit/install.js
packages/playwright-chromium/install.js
packages/playwright-firefox/install.js
packages/playwright-webkit/install.js
```

**Install Script Behavior:**
1. Checks if running in npx global context
2. Calls `installBrowsersForNpmInstall()` from playwright-core
3. Downloads browser binaries from Microsoft CDN
4. Installs to `~/.cache/ms-playwright/` directory

**Security Risks:**
- **Supply Chain Attack Vector:** If Microsoft CDN is compromised, malicious browser binaries could be distributed
- **Man-in-the-Middle:** Downloads may not verify cryptographic signatures
- **Privilege Escalation:** Install scripts run with user's npm permissions
- **Disk Space Exhaustion:** Large browser downloads (~300MB per browser)

**File Hash (for verification):**
```
SHA256: 319b19947fd59a6961b3d302957f9f2a1b409450174bff5c5d808a90fdb383e9
File: packages/playwright-browser-chromium/install.js
```

### Test Package Dependency Analysis

**Test Files Found:**
```
./packages/extension/tests/extension.spec.ts
./packages/playwright-mcp/tests/capabilities.spec.ts
./packages/playwright-mcp/tests/click.spec.ts
./packages/playwright-mcp/tests/core.spec.ts
./packages/playwright-mcp/tests/fixtures.ts
./packages/playwright-mcp/tests/library.spec.ts
./packages/playwright-mcp/tests/testserver/index.ts
```

**Test Dependencies:**
- Uses `@playwright/test` framework
- Test server implementation in `testserver/index.ts`
- No suspicious test dependencies detected

### Dependency Tree Analysis

**Production Dependencies (playwright-mcp):**
```
@playwright/mcp@0.0.68
├── playwright-core@1.59.0-alpha-1771104257000
└── playwright@1.59.0-alpha-1771104257000
    └── playwright-core@1.59.0-alpha-1771104257000 (deduped)
```

**Total Dependencies:**
- Production: 9 packages
- Development: 235 packages
- Optional: 53 packages
- **Total: 244 packages**

**NPM Audit Results:**
```json
{
  "vulnerabilities": {
    "info": 0,
    "low": 0,
    "moderate": 0,
    "high": 0,
    "critical": 0,
    "total": 0
  }
}
```

✅ **No known vulnerabilities** at time of audit (Feb 26, 2026)

### MCP Implementation Source Code Analysis

**Location:** `/home/ubuntu/playwright/packages/playwright/src/mcp/`

**Code Statistics:**
- **Total Lines:** 8,002 lines of TypeScript
- **Tool Modules:** 30 individual tool files
- **Core Modules:** Browser context, config, logging, session management

**Tool Capabilities:**
```typescript
// 30 MCP tools providing browser automation
[
  common, config, console, cookies, devtools, dialogs,
  evaluate, files, form, install, keyboard, mouse,
  navigate, network, pdf, route, runCode, screenshot,
  snapshot, storage, tabs, tracing, verify, video,
  wait, webstorage
]
```

**Security-Relevant Tools:**
- `evaluate.ts` - Execute arbitrary JavaScript in browser context
- `runCode.ts` - Run code snippets
- `files.ts` - File system operations
- `network.ts` - Network interception
- `route.ts` - Request routing and modification
- `storage.ts` - LocalStorage/SessionStorage access
- `cookies.ts` - Cookie manipulation

### Attack Surface Mapping

**1. Code Execution Vectors:**
```
evaluate.ts → page.evaluate() → Arbitrary JS execution in browser
runCode.ts → eval() in browser context → Code injection risk
```

**2. File System Access:**
```
files.ts → File upload/download → Path traversal risk
pdf.ts → PDF generation → File write permissions
screenshot.ts → Image capture → Disk space exhaustion
```

**3. Network Operations:**
```
navigate.ts → Navigate to arbitrary URLs → SSRF risk
network.ts → Intercept requests → MITM capabilities
route.ts → Modify responses → Content injection
```

**4. Data Exfiltration:**
```
cookies.ts → Extract authentication tokens
webstorage.ts → Access LocalStorage/SessionStorage
storage.ts → Download browser state
```

### Comparison to xz Backdoor (CVE-2024-3094)

| Aspect | xz Backdoor | Playwright MCP |
|--------|-------------|----------------|
| **Hidden Code** | Obfuscated in test files | ✅ Clean, auditable TypeScript |
| **Binary Payload** | Malicious .o files in tests | ✅ No suspicious binaries |
| **Install Scripts** | Modified build scripts | ⚠️ Browser download scripts |
| **Maintainer Trust** | Single maintainer compromised | ✅ Microsoft Corporation |
| **Code Complexity** | Intentionally obfuscated | ✅ Well-documented, readable |
| **Detection** | Valgrind slowdown | ✅ No anomalous behavior |

**Key Difference:** Playwright MCP is **legitimate, open-source software** with transparent implementation. The xz backdoor was **intentionally malicious** with obfuscated payloads.

### Hardening Recommendations

**1. Browser Binary Verification:**
```bash
# Verify browser binary checksums before execution
sha256sum ~/.cache/ms-playwright/chromium-*/chrome-linux/chrome
# Compare against published hashes from Microsoft
```

**2. Disable Auto-Install:**
```json
{
  "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD": "1"
}
```
Then manually install browsers with verified checksums.

**3. Restrict Tool Capabilities:**
```typescript
// Only enable necessary tools
const allowedTools = ['navigate', 'snapshot', 'verify'];
const filteredTools = browserTools.filter(t => allowedTools.includes(t.name));
```

**4. Sandbox Browser Processes:**
```bash
# Run Playwright in Docker with seccomp profile
docker run --security-opt seccomp=playwright-seccomp.json playwright-mcp
```

**5. Monitor File System Access:**
```bash
# Use auditd to monitor Playwright file operations
auditctl -w ~/.cache/ms-playwright/ -p wa -k playwright_files
```

### Conclusion

**Binary/Test Package Security Status: ✅ CLEAN**

- No malicious binaries detected
- No obfuscated code in source
- No suspicious test dependencies
- Install scripts are transparent and auditable
- NPM audit shows zero vulnerabilities

**However, risks remain:**
- Browser binaries downloaded from CDN (trust Microsoft)
- Large attack surface (30 tools, 8,000 LOC)
- Powerful capabilities (code execution, network access, file system)

**Recommendation:** Playwright MCP is **safe to use** but requires **defense-in-depth** security controls for enterprise deployment.
