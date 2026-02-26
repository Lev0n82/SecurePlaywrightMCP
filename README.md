# SecurePlaywrightMCP

**Hardened Playwright MCP Implementation with Enterprise Security Controls**

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
