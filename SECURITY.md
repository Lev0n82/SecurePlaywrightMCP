# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest (main) | ✅ Active security support |
| Previous release | ⚠️ Critical fixes only (90-day window) |
| Older releases | ❌ No security support |

## Reporting a Vulnerability

### Critical and High Severity (CVSS ≥ 7.0)

**Do NOT open a public GitHub issue.** Use one of the following private channels:

1. **GitHub Security Advisory (preferred):** [Report a vulnerability](../../security/advisories/new)
   — This creates a private draft advisory visible only to repository maintainers.

2. **ITS Security Review Board:** Contact your organisation's ITS Security Review Board directly
   if this vulnerability affects a production deployment within your enterprise.

### Medium and Low Severity (CVSS < 7.0)

Open a GitHub Issue using the [Security Vulnerability Report](.github/ISSUE_TEMPLATE/security-vulnerability.yml) template.

---

## Response Timeline

| Severity | Acknowledgement | Triage | Fix Target |
|----------|----------------|--------|------------|
| CRITICAL (9.0–10.0) | 4 hours | 24 hours | 72 hours |
| HIGH (7.0–8.9) | 24 hours | 72 hours | 14 days |
| MEDIUM (4.0–6.9) | 72 hours | 7 days | 60 days |
| LOW (0.1–3.9) | 7 days | 30 days | 90 days |

---

## Scope

The following are **in scope** for security reports:

- SecurePlaywrightMCP source code (`src/`)
- Container configuration (`Containerfile`, `security/`)
- GitHub Actions workflows (`.github/workflows/`)
- MCP protocol implementation and tool call handling
- Dependency supply chain (direct and transitive dependencies)
- HMAC signing implementation (if enabled)

The following are **out of scope**:

- The upstream `@playwright/mcp` package (report to Microsoft)
- The underlying Playwright browser engine (report to Microsoft)
- Vulnerabilities in the MCP protocol specification itself (report to Anthropic)
- Social engineering attacks against maintainers

---

## Disclosure Policy

SecurePlaywrightMCP follows a **coordinated disclosure** policy:

1. Reporter submits vulnerability via private channel.
2. Maintainers acknowledge within the response timeline above.
3. Maintainers develop and test a fix.
4. Fix is deployed to all supported versions.
5. CVE is requested (if applicable).
6. Public disclosure occurs **90 days** after the fix is available, or earlier by mutual agreement.
7. Reporter is credited in the security advisory (unless they request anonymity).

---

## Security Architecture

SecurePlaywrightMCP implements a 5-stage gatekeeping strategy to prevent supply chain attacks:

| Stage | Description |
|-------|-------------|
| Stage 1 | Automated security scanning (CodeQL, Semgrep, npm audit, binary detection) |
| Stage 2 | Manual code review by 2+ independent reviewers |
| Stage 3 | Security testing in isolated staging environment |
| Stage 4 | ITS Security Review Board approval |
| Stage 5 | Canary deployment (5% traffic, 24-hour monitoring) before full production |

See [docs/APPENDIX_D_APPLICATION_SECURITY.md](docs/APPENDIX_D_APPLICATION_SECURITY.md) for the complete security architecture.

---

## Known Security Considerations

### Supply Chain Risk

SecurePlaywrightMCP is a hardened wrapper around `@playwright/mcp`. The upstream package is pinned
to a specific version and verified against its published SHA-512 hash before each build. Any update
to the upstream dependency requires ITS Security Review Board approval.

### Browser Control Surface

Playwright controls a Chromium browser instance. The browser runs in a Podman rootless container
with a custom seccomp profile (`security/seccomp/playwright-mcp.json`) that restricts system calls
to the minimum required for browser operation. The container drops all Linux capabilities except
those explicitly required.

### MCP Protocol Trust Boundary

MCP tool calls are treated as untrusted input. All tool arguments are validated against a strict
schema before execution. Tool calls that attempt to access resources outside the configured
`allowedOrigins` list are rejected with a structured error response.
