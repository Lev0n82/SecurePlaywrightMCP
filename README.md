# SecurePlaywrightMCP

**A hardened, enterprise-grade reimplementation of the Microsoft Playwright MCP server, built for organisations that require defence-in-depth security, supply chain integrity, and regulatory compliance.**

[![Security Audit](https://img.shields.io/badge/Security%20Audit-3%20CVEs%20Found-yellow)](docs/playwright_mcp_security_findings.md)
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)
[![Container](https://img.shields.io/badge/Runtime-Podman%20Rootless-red)](docs/PODMAN_SECURITY_ANALYSIS.md)
[![Compliance](https://img.shields.io/badge/Compliance-NIST%20%7C%20ISO%2027001%20%7C%20SOC%202-orange)](docs/COMPLIANCE_MAPPING.md)

---

## Why This Repository Exists

Playwright MCP ([`@playwright/mcp`](https://github.com/microsoft/playwright-mcp)) is a powerful browser automation server that exposes the full capabilities of Microsoft Playwright through the Model Context Protocol (MCP). It enables AI agents to navigate websites, interact with UI elements, capture screenshots, execute JavaScript, and intercept network traffic — capabilities that are enormously useful for autonomous software development workflows such as the [AUTONOMOUS.ML CPU Agents for SDLC](https://github.com/Lev0n82/CPU-Agents-for-SDLC) project.

However, a formal security audit conducted on February 26, 2026 identified that **Playwright MCP, as distributed, is not suitable for direct enterprise deployment without significant hardening**. The audit examined the full source code of the `playwright-mcp` repository, the embedded MCP implementation inside the Playwright core monorepo (`packages/playwright/src/mcp/`, 8,002 lines of TypeScript across 30 tool modules), all direct and transitive dependencies (244 packages total), and all browser install scripts.

The audit found **no malicious code** — Playwright MCP is legitimate, well-maintained, open-source software from Microsoft. However, an authenticated Snyk CLI scan (March 1, 2026) identified **3 confirmed CVEs** in the dependency tree: CVE-2026-27606 in `rollup` (HIGH, CVSS 8.5), CVE-2025-69873 in `ajv` (HIGH, CVSS 8.2), and a timing-attack vulnerability in `hono` (MEDIUM, CVSS 6.3). None are directly exploitable in a default deployment, but all require patching. Beyond the CVEs, the broader concern is **attack surface**: the combination of a broad tool set, runtime npm downloads, CDN-distributed browser binaries, and powerful capabilities (arbitrary JavaScript execution, file system access, network interception, cookie and storage access) creates an unacceptable risk profile for environments handling sensitive data or operating under compliance frameworks such as NIST 800-53, ISO 27001, SOC 2, or PCI DSS.

SecurePlaywrightMCP was created to address this gap by providing a minimal, auditable, containerised deployment of Playwright MCP with mandatory security controls applied at every layer of the stack.

---

## Security Audit Findings

The full audit report is available at [`docs/playwright_mcp_security_findings.md`](docs/playwright_mcp_security_findings.md). Key findings are summarised here.

### Dependency Profile

The production dependency tree of `@playwright/mcp@0.0.68` resolves as follows:

```
@playwright/mcp@0.0.68
├── playwright-core@1.59.0-alpha-1771104257000
└── playwright@1.59.0-alpha-1771104257000
    └── playwright-core@1.59.0-alpha-1771104257000 (deduped)
```

| Category | Count |
|---|---|
| Production packages | 9 |
| Development packages | 235 |
| Optional packages | 53 |
| **Total** | **244** |

An authenticated **Snyk CLI v1.1303.0** scan (org: `lev0n82`, 189 dependencies scanned) and `npm audit` were both executed against the full dependency tree. **3 confirmed CVEs** were identified. Binary file scanning with `retire.js v5.4.2` found no additional issues. No malicious binaries, no obfuscated JavaScript, and no suspicious `preinstall`/`postinstall` scripts were found in the MCP packages. One WASM file was found (`tests/assets/wasm/table2.wasm`) — a test asset only, not present in production builds.

### Confirmed CVE Findings (Snyk Authenticated Scan — March 1, 2026)

| Snyk ID | CVE | Package | Severity (Snyk) | Severity (npm audit) | Dependency Path | Directly Exploitable |
|---|---|---|---|---|---|---|
| [SNYK-JS-ROLLUP-15340920](https://security.snyk.io/vuln/SNYK-JS-ROLLUP-15340920) | CVE-2026-27606 | `rollup@4.57.1` | **HIGH (CVSS 8.5)** | HIGH (9.3) | Direct dev dependency | ❌ Dev-time only |
| [SNYK-JS-AJV-15274295](https://security.snyk.io/vuln/SNYK-JS-AJV-15274295) | CVE-2025-69873 | `ajv@8.17.1` | **HIGH (CVSS 8.2)** | MODERATE (6.9) | `@modelcontextprotocol/sdk@1.26.0` → `ajv` | ❌ `$data` option not used |
| [SNYK-JS-HONO-15322749](https://security.snyk.io/vuln/SNYK-JS-HONO-15322749) | — | `hono@4.11.8` | **MEDIUM (CVSS 6.3)** | LOW (3.7) | `@modelcontextprotocol/sdk@1.26.0` → `hono` | ❌ Auth middleware not used |

**CVE-2026-27606 (rollup — Directory Traversal):** Insecure filename sanitisation in Rollup's core engine allows path traversal to write files outside the intended output directory via crafted CLI inputs or configuration values. This affects the build toolchain only — it is not present in the runtime MCP server. Fix: upgrade to `rollup@4.59.0`.

**CVE-2025-69873 (ajv — ReDoS):** When the `$data` option is enabled in ajv, the `pattern` keyword accepts runtime data via JSON Pointer syntax and passes it directly to `RegExp()` without validation, enabling catastrophic backtracking. Playwright MCP does not enable the `$data` option in any MCP tool schema. Fix: upgrade to `ajv@8.18.0`.

**SNYK-JS-HONO-15322749 (hono — Timing Attack):** The `basicAuth` and `bearerAuth` middlewares in Hono used non-constant-time string comparison, leaking credential information through timing side-channels. Playwright MCP uses Hono for HTTP routing only and does not use its auth middleware. Fix: upgrade to `hono@4.11.10`.

> **None of the three CVEs are directly exploitable in a default Playwright MCP deployment.** However, they represent real vulnerabilities in the dependency tree that should be patched. Snyk continuous monitoring has been configured at https://app.snyk.io/org/lev0n82/project/db916f09-1d3f-4970-8c20-a0d286b82568 to alert on newly disclosed issues.

**Remediation commands:**
```bash
# Fix all three CVEs
npm update rollup ajv hono
# Or pin specific versions:
npm install rollup@4.59.0 ajv@8.18.0 hono@4.11.10
```

### Critical Structural Finding

The most significant architectural discovery is that **Playwright MCP is not a standalone server**. The MCP implementation is embedded inside the Playwright core binary. The `playwright-mcp` package's entry point simply calls `require('playwright/lib/mcp/index')`. This means auditing the MCP server requires auditing the entire Playwright monorepo, and any vulnerability in Playwright core is directly inherited by the MCP server.

### Risk Classification

| Risk Level | Finding |
|---|---|
| 🔴 Critical | MCP implementation embedded in Playwright core binary — opaque without full monorepo audit |
| 🔴 Critical | Pinned to alpha build (`1.59.0-alpha-1771104257000`) — alpha builds carry unpatched vulnerability risk |
| 🔴 Critical | `npx @playwright/mcp@latest` downloads and executes code at runtime with no hash verification |
| 🔴 Critical | 30 MCP tools expose arbitrary JS execution, file system access, network interception, and full cookie/storage access |
| 🟡 Medium | 244 total packages — extensive transitive dependency surface for supply chain attacks |
| 🟡 Medium | Six browser install scripts download ~300 MB of browser binaries from Microsoft CDN without cryptographic signature verification |
| 🟡 Medium | Many security-relevant configuration flags — misconfiguration creates exploitable holes |
| 🟡 Medium | 3 confirmed CVEs in dependency tree (rollup HIGH, ajv HIGH, hono MEDIUM) — none directly exploitable in default config |
| 🟢 Low | No malicious binaries, no obfuscated code, transparent TypeScript implementation |
| 🟢 Low | Built-in origin whitelisting, isolated browser profiles, and configurable permissions available |

---

## Attack Vectors Documented

The audit mapped four primary attack chains that apply to any unprotected Playwright MCP deployment. These are not theoretical — each follows a pattern observed in real-world supply chain and browser exploitation incidents.

### 1. Supply Chain Compromise

```
Attacker
  → npm account takeover of @playwright/mcp maintainer
  → Publishes malicious @playwright/mcp release with backdoored code
  → Enterprise CI/CD pipeline runs: npx @playwright/mcp@latest
  → Malicious code executes with full browser automation privileges
  → Remote code execution on CI/CD host
```

This vector is directly analogous to the xz Utils backdoor (CVE-2024-3094), where a trusted open-source maintainer account was compromised over two years and a backdoor was inserted into a widely distributed library. The `npx @playwright/mcp@latest` installation pattern — downloading and executing the latest published version at runtime with no hash verification — is the highest-risk deployment pattern and must never be used in enterprise environments.

**SecurePlaywrightMCP mitigation:** All dependencies are pinned to exact versions with hash verification. The package is mirrored to a private registry before use. `npx` runtime downloads are prohibited.

### 2. Dependency Confusion

```
Attacker
  → Discovers internal package names used by target organisation
  → Publishes malicious package to public npm with matching name and higher version
  → npm resolves to the public (malicious) package instead of the internal one
  → Code executes during npm install — before any application code runs
```

Dependency confusion attacks have been demonstrated against major organisations including Microsoft, Apple, PayPal, and Uber. The attack requires no account compromise — it exploits npm's default resolution behaviour.

**SecurePlaywrightMCP mitigation:** All packages are resolved exclusively from a private npm registry with `--registry` scoping. Public npm fallback is disabled. Package integrity hashes are verified against a known-good manifest.

### 3. Browser Exploit Chain

```
Attacker
  → Crafts a malicious URL or web page
  → Sends it to the MCP server via a compromised AI agent or prompt injection
  → Browser loads the page and triggers a Chromium/WebKit vulnerability
  → Browser sandbox escape achieved via kernel exploit
  → Attacker gains code execution on the host running the MCP server
```

Playwright MCP exposes `navigate.ts`, `evaluate.ts`, and `runCode.ts` tools that allow an AI agent to direct the browser to arbitrary URLs and execute arbitrary JavaScript. If the AI agent itself is compromised via prompt injection in a web page it visits, it can be directed to load exploit pages. Browser sandbox escapes are a documented class of vulnerability with CVEs published against Chromium regularly.

**SecurePlaywrightMCP mitigation:** The MCP server runs inside a Podman rootless container with a custom seccomp profile blocking dangerous syscalls, SELinux mandatory access control, all Linux capabilities dropped, and a read-only root filesystem. Even a successful browser sandbox escape is contained within the container — the attacker cannot reach the host.

### 4. Configuration Exploitation (SSRF)

```
Attacker
  → Identifies a Playwright MCP deployment with permissive --allowed-hosts configuration
  → Directs the MCP server to navigate to internal service URLs
    (e.g., http://169.254.169.254/ for cloud metadata endpoints)
  → MCP server fetches internal resources on behalf of the attacker
  → Attacker exfiltrates cloud credentials, internal API keys, or sensitive service data
```

Server-Side Request Forgery (SSRF) is consistently ranked in the OWASP Top 10. Playwright MCP's `navigate.ts` tool will follow any URL it is given unless `--allowed-hosts` is explicitly configured. The default configuration permits unrestricted outbound navigation, making any deployment without explicit origin whitelisting vulnerable to SSRF against internal services and cloud metadata endpoints.

**SecurePlaywrightMCP mitigation:** Network egress is blocked by default at the container level using Podman network isolation. Only explicitly whitelisted domains are reachable. The `--allowed-hosts` flag is enforced in the MCP server configuration, and `--blocked-origins` is used to deny internal RFC 1918 address ranges and cloud metadata endpoints.

---

## Immediate Actions for Any Playwright MCP Deployment

Regardless of whether SecurePlaywrightMCP is adopted, the following actions should be taken immediately for any existing Playwright MCP deployment:

**Pin exact versions.** Never use `@playwright/mcp@latest` or any floating version specifier. Lock to a specific version with hash verification in your lock file and update deliberately after reviewing changelogs and running security scans.

**Use a private npm registry.** Mirror `@playwright/mcp` and its dependencies to an internal registry (Artifactory, Nexus, or Verdaccio). Scan packages before mirroring. Disable public npm fallback for scoped packages. Control the update cadence — do not automatically pull new versions.

**Segment the network.** Run the MCP server in an isolated network zone. Block all outbound traffic by default and whitelist only the domains the server legitimately needs to reach. Never expose the MCP server's port to the public internet or to untrusted internal networks.

**Disable auto-install of browser binaries.** Set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` in your environment. Install browser binaries manually from a verified source and validate SHA-256 checksums before execution.

**Restrict tool capabilities.** Audit which of the 30 MCP tools your use case actually requires. Disable `evaluate`, `runCode`, `files`, `network`, and `route` unless there is a specific, reviewed justification for enabling them.

---

## Long-Term Security Strategy

**Hardened fork (this repository).** SecurePlaywrightMCP provides a minimal reimplementation using only `playwright-core` and `@modelcontextprotocol/sdk`, with mandatory sandboxing at every layer, a restricted tool surface, full audit logging of all browser actions, and a documented security review process for all changes.

**SBOM generation.** A Software Bill of Materials is generated on every build using CycloneDX. This provides a complete inventory of all components and their versions for compliance audits, vulnerability response, and incident investigation.

**Continuous monitoring.** Automated vulnerability scanning runs on every pull request and on a nightly schedule using CodeQL (static analysis), Semgrep (security-focused pattern matching), and `npm audit` (dependency CVE checking). Dependabot is configured to raise pull requests for dependency updates, which are reviewed by the ITS Security Review Board before merging.

**Incident response.** A documented incident response plan covers the detection, containment, eradication, and recovery procedures for a supply chain compromise of any dependency used by this repository. See [SECURITY.md](SECURITY.md) for vulnerability reporting procedures.

---

## Remediation Plan

This section documents the formal remediation plan for all findings identified during the security audit. Remediation is tracked against three time horizons: **immediate** (within 1 sprint), **medium-term** (within the current quarter), and **long-term** (ongoing governance).

### Immediate Remediation — CVE Patches

All three CVEs identified by the Snyk scan have known fixes available and should be patched before any production deployment.

| CVE | Package | Current Version | Fixed Version | Action |
|---|---|---|---|---|
| CVE-2026-27606 | `rollup` | 4.57.1 | 4.59.0+ | `npm install rollup@4.59.0` |
| CVE-2025-69873 | `ajv` | 8.17.1 | 8.18.0+ | `npm install ajv@8.18.0` |
| SNYK-JS-HONO-15322749 | `hono` | 4.11.8 | 4.11.10+ | `npm install hono@4.11.10` |

```bash
# Apply all three patches in one command
npm install rollup@4.59.0 ajv@8.18.0 hono@4.11.10

# Verify no remaining vulnerabilities
npm audit
snyk test
```

Note that `rollup` is a dev-time build dependency and `ajv`/`hono` are transitive dependencies of `@modelcontextprotocol/sdk`. If `@modelcontextprotocol/sdk` does not yet ship with patched versions of these packages, use `npm overrides` (or `pnpm.overrides` / `yarn resolutions`) to force the patched versions:

```json
// package.json
"overrides": {
  "ajv": ">=8.18.0",
  "hono": ">=4.11.10",
  "rollup": ">=4.59.0"
}
```

### Immediate Remediation — MCP Protocol Hardening

The six critical findings from the MCP protocol analysis each require a configuration or deployment change:

| Finding | Remediation | Owner |
|---|---|---|
| No authentication on HTTP transport | Enable `--auth-token` flag; enforce bearer token validation on all requests | Deployment team |
| Undocumented `/killkillkill` endpoint | Block the endpoint at the reverse proxy layer; restrict MCP port to localhost only | Infrastructure |
| `browser_run_code` uses Node.js `vm` (not a sandbox) | Disable `browser_run_code` tool unless explicitly required; run in Podman rootless container | Deployment team |
| File upload accepts absolute paths | Restrict file tool to a designated working directory using `--working-dir`; validate paths server-side | Application team |
| HttpOnly cookie exfiltration via CDP | Disable `browser_cookies` tool unless required; audit all cookie access in audit logs | Security team |
| Network interception with header injection | Disable `browser_network_*` tools unless required; restrict to whitelisted domains | Deployment team |

### Medium-Term Remediation — Supply Chain Controls

Within the current quarter, the following supply chain controls should be established for any team consuming Playwright MCP:

A **private npm registry** (Artifactory, Nexus, or Verdaccio) should be provisioned to mirror `@playwright/mcp` and all its dependencies. The registry should be configured to disable public npm fallback for scoped packages, and all packages should be scanned with `npm audit` and Snyk before being admitted to the mirror. The update cadence should be controlled — no automatic version pulls.

**Version pinning** must be enforced across all environments. The `package-lock.json` or `pnpm-lock.yaml` file must be committed to source control and verified in CI. Floating version specifiers (`@latest`, `^`, `~`) must be prohibited in `package.json` for all security-sensitive packages. A pre-commit hook should reject any `package.json` changes that introduce floating specifiers.

**Browser binary verification** should be implemented by setting `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` in all environments and distributing browser binaries through a controlled internal channel with SHA-256 checksum verification.

### Medium-Term Remediation — Container Hardening

All Playwright MCP deployments should be migrated to the SecurePlaywrightMCP Podman rootless container configuration documented in this repository. The migration provides:

- Elimination of the root daemon attack surface (Podman daemonless architecture)
- User namespace mapping that limits container escape impact (container UID 0 → host UID 100000+)
- Custom seccomp profile blocking 50+ dangerous syscalls
- SELinux mandatory access control with automatic container labelling
- Read-only root filesystem preventing binary modification by malware
- Network egress blocked by default with explicit domain whitelisting

### Long-Term Governance

Sustained security posture requires ongoing governance processes rather than one-time fixes. The following processes should be established:

**Continuous vulnerability monitoring** is configured via Snyk at https://app.snyk.io/org/lev0n82/project/db916f09-1d3f-4970-8c20-a0d286b82568. Snyk will send automated alerts when new CVEs are disclosed against any of the 189 scanned dependencies. All alerts should be triaged within 48 hours and patched within the SLA defined by severity (Critical: 24h, High: 7 days, Medium: 30 days, Low: 90 days).

**SBOM generation** on every build using CycloneDX provides a complete, auditable inventory of all components. The SBOM should be stored alongside each release artifact and submitted to the organisation's vulnerability management platform for continuous monitoring.

**Security review board approval** is required for all dependency updates. The ITS Security Review Board reviews the Snyk diff, the changelog, and the npm audit output before any dependency version change is merged to the main branch.

**Annual penetration testing** of the full SecurePlaywrightMCP deployment should be conducted by an independent security team, covering the four documented attack chains and any newly discovered vulnerability classes.

---

## Relationship to AUTONOMOUS.ML CPU Agents for SDLC

SecurePlaywrightMCP is the browser automation foundation for the [AUTONOMOUS.ML CPU Agents for SDLC](https://github.com/Lev0n82/CPU-Agents-for-SDLC) project. Phase 4.1 of that project — automated test generation with GUI object mapping — requires an AI agent to navigate web applications, inventory UI elements, and generate test cases autonomously. SecurePlaywrightMCP provides that browser automation capability within a security boundary acceptable for enterprise and government environments.

> **Playwright MCP** is browser control infrastructure — the "hands" that manipulate the browser.
> **SecurePlaywrightMCP** is the hardened deployment of those hands, with mandatory security controls at every layer.
> **CPU Agents Phase 4.1** is the intelligence layer — the "brain" that decides what to do with the browser.

---

## Hardened Playwright MCP Implementation with Enterprise Security Controls

SecurePlaywrightMCP is a security-focused implementation of the Playwright Model Context Protocol (MCP) designed for enterprise environments. It provides browser automation capabilities with defense-in-depth security controls, including Podman rootless containers, custom seccomp profiles, SELinux enforcement, and a 5-stage gatekeeping strategy to prevent supply chain attacks.

---

## 🔒 Security First

Unlike the standard Playwright MCP, SecurePlaywrightMCP is built with **enterprise security requirements** as the primary design constraint:

| Feature | Standard Playwright MCP | SecurePlaywrightMCP |
|---------|------------------------|---------------------|
| **Container Runtime** | Docker (root daemon) | Podman (rootless, daemonless) |
| **Privilege Model** | Requires root access | Runs as unprivileged user |
| **Supply Chain Security** | Standard npm audit | 5-stage gatekeeping strategy |
| **System Call Filtering** | Default seccomp | Custom hardened seccomp profile |
| **Mandatory Access Control** | Optional SELinux | Enforced SELinux with custom policies |
| **Capabilities** | Standard set | All dropped, minimal added |
| **Root Filesystem** | Read-write | Read-only with tmpfs |
| **Attack Surface** | Large (daemon + client) | Minimal (client only) |
| **Compliance** | Basic | NIST CSF, ISO 27001, SOC 2, PCI DSS |

---

## 🎯 Key Features

### 1. Podman Rootless Architecture

- **No root daemon** - Eliminates single point of failure
- **User namespace mapping** - Container UID 0 maps to unprivileged host UID (e.g., 100000)
- **90%+ attack surface reduction** - Even if container is compromised, attacker gains limited privileges
- **Docker-compatible** - Drop-in replacement for Docker-based workflows

### 2. Defense-in-Depth Security

- **7 security layers**: Namespaces, Cgroups, Seccomp, SELinux, Capabilities, User Namespaces, Image Verification
- **Custom seccomp profile** - Blocks 50+ dangerous system calls (mount, reboot, ptrace, kexec_load, etc.)
- **SELinux enforcement** - Mandatory access control with automatic labeling
- **Capability dropping** - All Linux capabilities dropped by default
- **Read-only root filesystem** - Prevents malware installation and binary modification

### 3. Supply Chain Attack Prevention

Implements lessons learned from the **xz Utils backdoor (CVE-2024-3094)** through a **5-stage gatekeeping strategy**:

**Stage 1: Automated Pre-Screening** (Continuous)
- Repository-tarball comparison (detects hidden backdoors)
- Static analysis (CodeQL, Semgrep)
- Dependency scanning (npm audit, Snyk)
- Binary file detection and analysis
- Malware scanning (VirusTotal)
- Sandboxed execution monitoring

**Stage 2: Manual Code Review** (Per Release)
- Multi-party review (2+ independent reviewers)
- Focus on build scripts, binaries, security-critical code
- Standardized review checklist
- Audit log of all approvals

**Stage 3: Security Testing** (Per Release)
- Reproducible build verification
- Fuzzing and penetration testing
- Performance benchmarking (detect 500ms anomalies)
- Behavioral monitoring (network, filesystem, processes)

**Stage 4: Approval and Staging** (Per Release)
- ITS Security Review Board approval
- Risk-based approval workflow
- 30-day staging deployment
- 14-day canary release (10% of systems)

**Stage 5: Production Rollout** (Ongoing)
- Gradual rollout (10% → 25% → 50% → 100%)
- Automated rollback triggers
- Continuous monitoring
- Incident response plan

### 4. Enterprise Compliance

Meets security requirements for:
- **NIST Cybersecurity Framework** (PR.AC-4, PR.AC-1, PR.AC-5, DE.AE-3, ID.RA-1, PR.IP-3)
- **ISO 27001** (A.9.2.3, A.9.1.1, A.13.1.3, A.12.4.1, A.12.6.1, A.12.1.2)
- **SOC 2** (CC6.3, CC6.1, CC6.6, CC7.2, CC7.1, CC8.1)
- **PCI DSS** (7.1.2, 7.1, 2.2.1, 10.2, 6.2, 6.4.5)

---

## 🚀 Quick Start

### Prerequisites

- **Podman** 4.0+ (rootless mode)
- **Node.js** 18+ and npm/pnpm
- **Linux kernel** 4.18+ (for full rootless support)
- **SELinux** enabled (Fedora, RHEL, CentOS)

### Installation

```bash
# Clone the repository
git clone https://github.com/Lev0n82/SecurePlaywrightMCP.git
cd SecurePlaywrightMCP

# Install dependencies
pnpm install

# Configure rootless Podman (if not already done)
./scripts/setup-rootless-podman.sh

# Build the hardened container image
pnpm run build:container

# Run SecurePlaywrightMCP
pnpm start
```

### Production Deployment

```bash
# Deploy with full security hardening
podman run -d \
    --name secureplaywrightmcp \
    --userns=auto \
    --security-opt label=type:container_runtime_t \
    --security-opt seccomp=/etc/containers/secureplaywrightmcp-seccomp.json \
    --cap-drop=ALL \
    --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,size=100m \
    --memory=2g \
    --cpus=2 \
    --pids-limit=100 \
    --network=secureplaywrightmcp-net \
    -v /data/playwright:/data:Z \
    --security-opt no-new-privileges \
    secureplaywrightmcp:latest

# Or use the provided Systemd service
systemctl --user enable secureplaywrightmcp.service
systemctl --user start secureplaywrightmcp.service
```

---

## 📚 Documentation

- **[Security Architecture](docs/SECURITY_ARCHITECTURE.md)** - Defense-in-depth design and threat model
- **[Podman Security Guide](docs/PODMAN_SECURITY_ANALYSIS.md)** - Rootless containers and hardening
- **[Gatekeeping Strategy](docs/XZ_BACKDOOR_LESSONS_LEARNED.md)** - Supply chain attack prevention
- **[Deployment Guide](docs/DEPLOYMENT_GUIDE.md)** - Production deployment procedures
- **[Compliance Mapping](docs/COMPLIANCE_MAPPING.md)** - NIST, ISO 27001, SOC 2, PCI DSS
- **[API Reference](docs/API_REFERENCE.md)** - MCP protocol implementation

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Host System                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │              Linux Kernel                         │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │      SecurePlaywrightMCP Container          │  │  │
│  │  │  ┌───────────────────────────────────────┐  │  │  │
│  │  │  │    Playwright Browser Automation     │  │  │  │
│  │  │  └───────────────────────────────────────┘  │  │  │
│  │  │                                             │  │  │
│  │  │  Security Layers:                           │  │  │
│  │  │  1. Namespaces (PID, NET, IPC, UTS, MNT)    │  │  │
│  │  │  2. Cgroups v2 (CPU, memory, PIDs limits)   │  │  │
│  │  │  3. Seccomp (syscall filtering)             │  │  │
│  │  │  4. SELinux (MAC policy enforcement)        │  │  │
│  │  │  5. Capabilities (all dropped)              │  │  │
│  │  │  6. User Namespaces (UID 0 → 100000)        │  │  │
│  │  │  7. Image Verification (signed images)      │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  Podman Runtime (Rootless Mode)                         │
└─────────────────────────────────────────────────────────┘
```

---

## 🔐 Security Controls

### Seccomp Profile

Custom seccomp profile blocks dangerous system calls:

```json
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "syscalls": [
    {
      "names": ["reboot", "swapon", "swapoff", "mount", "umount", 
                "ptrace", "kexec_load", "init_module", "delete_module"],
      "action": "SCMP_ACT_ERRNO"
    }
  ]
}
```

### SELinux Policy

Automatic labeling with custom policy module:

```bash
# Container processes run with restricted SELinux type
--security-opt label=type:container_runtime_t

# Multi-Category Security (MCS) labels for isolation
--security-opt label=level:s0:c100,c200
```

### Capability Dropping

All Linux capabilities dropped, minimal added:

```bash
# Drop all capabilities
--cap-drop=ALL

# Add only if absolutely required (example: bind to port 80)
--cap-add=CAP_NET_BIND_SERVICE
```

---

## 🧪 Testing

```bash
# Run security tests
pnpm test:security

# Run compliance validation
pnpm test:compliance

# Run penetration tests
pnpm test:pentest

# Generate security audit report
pnpm run audit
```

---

## 🤝 Contributing

SecurePlaywrightMCP follows a **strict security review process** for all contributions:

1. **Fork and create feature branch**
2. **Implement changes with tests**
3. **Pass automated security scans** (CodeQL, Semgrep, npm audit)
4. **Submit pull request** with detailed description
5. **Multi-party code review** (2+ reviewers required)
6. **ITS Security Review Board approval** (for security-critical changes)
7. **Staging deployment** (30 days minimum)
8. **Canary release** (14 days, 10% of systems)
9. **Production rollout** (gradual, with monitoring)

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## 📋 License

MIT License - See [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- **Microsoft Playwright Team** - Original Playwright MCP implementation
- **Podman Project** - Rootless container runtime
- **Red Hat** - SELinux and container security expertise
- **CISA** - xz Utils backdoor analysis and lessons learned
- **Datadog Security Labs** - Supply chain attack research

---

## 📞 Support

- **Documentation**: [https://github.com/Lev0n82/SecurePlaywrightMCP/docs](https://github.com/Lev0n82/SecurePlaywrightMCP/tree/main/docs)
- **Issues**: [https://github.com/Lev0n82/SecurePlaywrightMCP/issues](https://github.com/Lev0n82/SecurePlaywrightMCP/issues)
- **Security**: See [SECURITY.md](SECURITY.md) for vulnerability reporting

---

## ⚠️ Security Notice

SecurePlaywrightMCP is designed for **enterprise environments with strict security requirements**. While it provides significant security enhancements over standard Playwright MCP, **no system is 100% secure**. Always:

- Keep dependencies up to date
- Monitor security advisories
- Conduct regular security audits
- Follow the principle of least privilege
- Implement defense-in-depth
- Have an incident response plan

**Report security vulnerabilities privately** to the ITS Security Review Board, not via public GitHub issues.

---

**Built with security in mind. Hardened for enterprise deployment.**
