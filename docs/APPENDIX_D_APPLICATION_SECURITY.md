# Appendix D: Layer 4 - Application Security Controls

**Document:** Defense-in-Depth Security Controls for SecurePlaywrightMCP  
**Appendix:** D - Application Security  
**Version:** 1.0

---

## Overview

Layer 4 (Application Security) is the **most critical layer** for preventing supply chain attacks like the xz Utils backdoor. This layer secures the SecurePlaywrightMCP codebase through static analysis, dynamic analysis, software composition analysis, and secure development practices.

### Objectives

1. **Prevent Supply Chain Compromise**: Detect and block malicious code in dependencies before deployment
2. **Secure the SDLC**: Integrate security into every phase of the software development lifecycle
3. **Minimize Attack Surface**: Reduce code complexity and eliminate unnecessary dependencies
4. **Enable Rapid Response**: Detect and remediate vulnerabilities quickly through automated scanning

### Control Categories

- **D.1**: Software Composition Analysis (SCA)
- **D.2**: Static Application Security Testing (SAST)
- **D.3**: Dynamic Application Security Testing (DAST)
- **D.4**: Secrets Management
- **D.5**: Secure Code Review
- **D.6**: Dependency Pinning and Verification
- **D.7**: Build Reproducibility
- **D.8**: Security Testing in CI/CD

---

## D.1: Software Composition Analysis (SCA)

### Purpose

Software Composition Analysis (SCA) identifies known vulnerabilities, license compliance issues, and suspicious behavior in open source dependencies. This control is **critical** for detecting compromised dependencies like the xz Utils backdoor.

### Control Specification

**Control ID**: D.1  
**Priority**: P0 (Critical)  
**Validation**: Automated scanning in CI/CD pipeline

**Requirements**:
1. All dependencies (direct and transitive) must be scanned for known vulnerabilities before deployment
2. Vulnerabilities rated Critical or High must be remediated before production deployment
3. New dependencies must undergo security review before being added to the project
4. Dependency updates must be reviewed and approved by security team
5. SCA scan results must be integrated with SIEM for centralized monitoring

### Implementation Guide

**Step 1: Select SCA Tool**

Recommended tools (in order of preference for enterprise deployment):

| Tool | Type | Strengths | Weaknesses |
|------|------|-----------|------------|
| **Snyk** | Commercial SaaS | Comprehensive vulnerability database, excellent npm/Node.js support, automated PR fixes | Requires cloud connectivity |
| **GitHub Advanced Security** | Commercial SaaS | Native GitHub integration, Dependabot alerts, CodeQL integration | Limited to GitHub-hosted repos |
| **Sonatype Nexus Lifecycle** | Commercial | Enterprise-grade policy enforcement, private registry integration | Complex setup |
| **npm audit** | Open Source | Built into npm, zero cost, simple to use | Limited vulnerability database, no policy enforcement |
| **OWASP Dependency-Check** | Open Source | Multi-language support, local scanning | Slower than commercial tools, requires maintenance |

**Recommendation**: Use **Snyk** for comprehensive coverage, supplemented by **npm audit** as a lightweight backup.

**Step 2: Configure SCA Tool**

Example Snyk configuration (`.snyk` file):

```yaml
# Snyk (https://snyk.io) policy file

version: v1.25.0

# Ignore specific vulnerabilities (with justification)
ignore:
  # Example: Ignore low-severity prototype pollution in dev dependency
  'SNYK-JS-MINIMIST-559764':
    - '*':
        reason: 'Dev dependency only, not exposed in production'
        expires: '2026-06-01T00:00:00.000Z'

# Patch vulnerabilities automatically
patch: {}

# Fail build on vulnerabilities
failThreshold: high

# Exclude paths from scanning
exclude:
  - 'test/**'
  - 'docs/**'
  - '*.test.ts'

# Monitor project continuously
monitor: true

# Organization settings
org: 'your-org-name'
```

**Step 3: Integrate with CI/CD Pipeline**

Example GitHub Actions workflow (`.github/workflows/security-scan.yml`):

```yaml
name: Security Scan

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    # Run daily at 2 AM UTC
    - cron: '0 2 * * *'

jobs:
  sca-scan:
    name: Software Composition Analysis
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run npm audit
        run: npm audit --audit-level=high
        continue-on-error: true
      
      - name: Run Snyk scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high --fail-on=upgradable
      
      - name: Upload Snyk results to GitHub Security
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: snyk.sarif
      
      - name: Notify security team on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          webhook-url: ${{ secrets.SLACK_WEBHOOK_SECURITY }}
          payload: |
            {
              "text": "🚨 SCA scan failed for ${{ github.repository }}",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Security Alert*\nSCA scan detected vulnerabilities in ${{ github.repository }}\n\n*Branch:* ${{ github.ref }}\n*Commit:* ${{ github.sha }}\n*Author:* ${{ github.actor }}\n\n<${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View Details>"
                  }
                }
              ]
            }
```

**Step 4: Configure Dependency Review**

Enable GitHub Dependency Review to block PRs with vulnerable dependencies:

```yaml
# .github/workflows/dependency-review.yml
name: Dependency Review

on: [pull_request]

permissions:
  contents: read
  pull-requests: write

jobs:
  dependency-review:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Dependency Review
        uses: actions/dependency-review-action@v4
        with:
          fail-on-severity: high
          deny-licenses: GPL-3.0, AGPL-3.0
          comment-summary-in-pr: always
```

### Validation Test Cases

**Test Case D.1.1: Detect Known Vulnerability**

**Objective**: Verify SCA tool detects known vulnerabilities in dependencies

**Procedure**:
1. Add dependency with known vulnerability (e.g., `lodash@4.17.15` with CVE-2020-8203)
2. Run SCA scan
3. Verify scan fails with error message identifying vulnerability

**Expected Result**: SCA scan fails, CI/CD pipeline blocked, security team notified

**Test Case D.1.2: Block Unapproved Dependency**

**Objective**: Verify new dependencies require security review

**Procedure**:
1. Create PR adding new dependency without security review approval
2. Run dependency review workflow
3. Verify PR is blocked pending security review

**Expected Result**: PR blocked, comment added requesting security review

**Test Case D.1.3: Continuous Monitoring**

**Objective**: Verify SCA tool monitors project for newly-discovered vulnerabilities

**Procedure**:
1. Deploy project with no known vulnerabilities
2. Wait for new vulnerability disclosure in existing dependency
3. Verify SCA tool generates alert within 24 hours

**Expected Result**: Alert generated, security team notified, remediation ticket created

---

## D.2: Static Application Security Testing (SAST)

### Purpose

Static Application Security Testing (SAST) analyzes source code for security vulnerabilities without executing the code. SAST detects issues like SQL injection, cross-site scripting (XSS), insecure deserialization, and hardcoded secrets.

### Control Specification

**Control ID**: D.2  
**Priority**: P0 (Critical)  
**Validation**: Automated scanning in CI/CD pipeline

**Requirements**:
1. All code must pass SAST scan before merging to main branch
2. Critical and High severity findings must be remediated before deployment
3. SAST scan must cover 100% of application code (excluding test files)
4. False positives must be documented and suppressed with justification
5. SAST results must be integrated with GitHub Security or equivalent

### Implementation Guide

**Step 1: Select SAST Tool**

Recommended tools:

| Tool | Type | Strengths | Weaknesses |
|------|------|-----------|------------|
| **CodeQL** | Commercial/OSS | Deep semantic analysis, excellent TypeScript/JavaScript support, GitHub native | Slower than competitors, requires GitHub |
| **Semgrep** | Commercial/OSS | Fast, customizable rules, low false positives | Smaller vulnerability database than CodeQL |
| **SonarQube** | Commercial/OSS | Comprehensive code quality + security, excellent reporting | Requires dedicated server, complex setup |
| **ESLint Security Plugin** | Open Source | Lightweight, fast, integrates with existing ESLint | Limited to basic security checks |

**Recommendation**: Use **CodeQL** for comprehensive analysis, supplemented by **Semgrep** for custom rules.

**Step 2: Configure CodeQL**

Example CodeQL configuration (`.github/codeql/codeql-config.yml`):

```yaml
name: "SecurePlaywrightMCP CodeQL Config"

queries:
  - uses: security-extended
  - uses: security-and-quality

paths-ignore:
  - 'test/**'
  - 'docs/**'
  - '**/*.test.ts'
  - '**/*.spec.ts'

paths:
  - 'server/**'
  - 'client/src/**'
  - 'shared/**'

query-filters:
  - exclude:
      id: js/unused-local-variable
  - exclude:
      id: js/useless-assignment-to-local
```

**Step 3: Integrate with CI/CD Pipeline**

Example GitHub Actions workflow:

```yaml
name: CodeQL Analysis

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1'  # Weekly on Monday at 6 AM UTC

jobs:
  analyze:
    name: CodeQL Security Scan
    runs-on: ubuntu-latest
    permissions:
      actions: read
      contents: read
      security-events: write
    
    strategy:
      fail-fast: false
      matrix:
        language: ['javascript']
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: ${{ matrix.language }}
          config-file: .github/codeql/codeql-config.yml
          queries: security-extended
      
      - name: Autobuild
        uses: github/codeql-action/autobuild@v3
      
      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3
        with:
          category: "/language:${{ matrix.language }}"
      
      - name: Check for critical vulnerabilities
        run: |
          # Fail build if critical vulnerabilities found
          CRITICAL_COUNT=$(gh api \
            -H "Accept: application/vnd.github+json" \
            /repos/${{ github.repository }}/code-scanning/alerts?state=open&severity=critical \
            --jq 'length')
          
          if [ "$CRITICAL_COUNT" -gt 0 ]; then
            echo "❌ Found $CRITICAL_COUNT critical vulnerabilities"
            exit 1
          fi
        env:
          GH_TOKEN: ${{ github.token }}
```

**Step 4: Configure Custom Semgrep Rules**

Create custom rules for SecurePlaywrightMCP-specific security patterns (`.semgrep/rules.yml`):

```yaml
rules:
  - id: playwright-mcp-unsafe-eval
    patterns:
      - pattern: eval($ARG)
      - pattern-not: eval("...")
    message: "Unsafe use of eval() detected. This can lead to code injection vulnerabilities."
    languages: [javascript, typescript]
    severity: ERROR
    metadata:
      category: security
      cwe: "CWE-95: Improper Neutralization of Directives in Dynamically Evaluated Code"
      owasp: "A03:2021 - Injection"
  
  - id: playwright-mcp-hardcoded-secret
    patterns:
      - pattern-either:
          - pattern: |
              const $VAR = "$SECRET"
          - pattern: |
              let $VAR = "$SECRET"
      - metavariable-regex:
          metavariable: $VAR
          regex: .*(password|secret|token|api_key|apikey).*
      - metavariable-regex:
          metavariable: $SECRET
          regex: ^[A-Za-z0-9+/=]{20,}$
    message: "Potential hardcoded secret detected. Use environment variables or secrets management."
    languages: [javascript, typescript]
    severity: ERROR
    metadata:
      category: security
      cwe: "CWE-798: Use of Hard-coded Credentials"
  
  - id: playwright-mcp-unsafe-browser-eval
    patterns:
      - pattern: page.evaluate($CODE)
      - metavariable-pattern:
          metavariable: $CODE
          patterns:
            - pattern-not: "..."
            - pattern-not: () => { ... }
    message: "Dynamic code in page.evaluate() may be vulnerable to injection. Use static functions."
    languages: [javascript, typescript]
    severity: WARNING
    metadata:
      category: security
      cwe: "CWE-94: Improper Control of Generation of Code"
```

### Validation Test Cases

**Test Case D.2.1: Detect SQL Injection**

**Objective**: Verify SAST detects SQL injection vulnerabilities

**Procedure**:
1. Add code with SQL injection vulnerability:
   ```typescript
   const query = `SELECT * FROM users WHERE id = ${userId}`;
   db.execute(query);
   ```
2. Run SAST scan
3. Verify scan detects SQL injection vulnerability

**Expected Result**: SAST scan fails, vulnerability reported with severity HIGH

**Test Case D.2.2: Detect Hardcoded Secret**

**Objective**: Verify SAST detects hardcoded secrets

**Procedure**:
1. Add code with hardcoded API key:
   ```typescript
   const API_KEY = "sk_live_51H7xYzABcD123456789";
   ```
2. Run SAST scan
3. Verify scan detects hardcoded secret

**Expected Result**: SAST scan fails, secret detected and reported

---

## D.3: Dynamic Application Security Testing (DAST)

### Purpose

Dynamic Application Security Testing (DAST) tests running applications for vulnerabilities by simulating attacks. DAST detects runtime issues like authentication bypass, session management flaws, and server misconfigurations.

### Control Specification

**Control ID**: D.3  
**Priority**: P1 (High)  
**Validation**: Automated scanning in staging environment

**Requirements**:
1. DAST scans must be performed in staging environment before production deployment
2. Critical and High severity findings must be remediated before production deployment
3. DAST scans must test all exposed API endpoints and web interfaces
4. DAST scans must include authentication testing (valid and invalid credentials)
5. DAST results must be integrated with vulnerability management system

### Implementation Guide

**Step 1: Select DAST Tool**

Recommended tools:

| Tool | Type | Strengths | Weaknesses |
|------|------|-----------|------------|
| **OWASP ZAP** | Open Source | Free, comprehensive, active community | Requires configuration, slower than commercial |
| **Burp Suite Professional** | Commercial | Excellent for manual testing, powerful scanner | Expensive, requires security expertise |
| **Acunetix** | Commercial | Fast, automated, good reporting | High cost, some false positives |
| **Nuclei** | Open Source | Fast, template-based, scriptable | Limited to known vulnerabilities |

**Recommendation**: Use **OWASP ZAP** for automated scanning, supplemented by **Burp Suite** for manual penetration testing.

**Step 2: Configure OWASP ZAP**

Example ZAP automation framework configuration (`zap-config.yaml`):

```yaml
env:
  contexts:
    - name: SecurePlaywrightMCP
      urls:
        - https://staging.secureplaywrightmcp.example.com
      includePaths:
        - "https://staging.secureplaywrightmcp.example.com/api/.*"
        - "https://staging.secureplaywrightmcp.example.com/.*"
      excludePaths:
        - "https://staging.secureplaywrightmcp.example.com/static/.*"
        - "https://staging.secureplaywrightmcp.example.com/docs/.*"
      authentication:
        method: "form"
        parameters:
          loginUrl: "https://staging.secureplaywrightmcp.example.com/login"
          loginRequestData: "username={%username%}&password={%password%}"
        verification:
          method: "response"
          loggedInRegex: "\\QLogout\\E"
          loggedOutRegex: "\\QLogin\\E"
      users:
        - name: "test-user"
          credentials:
            username: "test@example.com"
            password: "${TEST_USER_PASSWORD}"

  parameters:
    failOnError: true
    failOnWarning: false
    progressToStdout: true

jobs:
  - type: spider
    parameters:
      context: SecurePlaywrightMCP
      user: test-user
      maxDuration: 10
      maxDepth: 5
  
  - type: passiveScan-wait
    parameters:
      maxDuration: 5
  
  - type: activeScan
    parameters:
      context: SecurePlaywrightMCP
      user: test-user
      policy: "API-Minimal"
      maxRuleDurationInMins: 5
      maxScanDurationInMins: 30
  
  - type: report
    parameters:
      template: "traditional-json"
      reportDir: "/zap/reports"
      reportFile: "zap-report"
      reportTitle: "SecurePlaywrightMCP DAST Scan"
```

**Step 3: Integrate with CI/CD Pipeline**

Example GitHub Actions workflow for staging deployment:

```yaml
name: DAST Scan (Staging)

on:
  workflow_run:
    workflows: ["Deploy to Staging"]
    types:
      - completed

jobs:
  dast-scan:
    name: OWASP ZAP Scan
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Run OWASP ZAP scan
        uses: zaproxy/action-full-scan@v0.9.0
        with:
          target: 'https://staging.secureplaywrightmcp.example.com'
          rules_file_name: '.zap/rules.tsv'
          cmd_options: '-a -j -l WARN -z "-config api.key=${{ secrets.ZAP_API_KEY }}"'
      
      - name: Upload ZAP report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: zap-scan-report
          path: report_html.html
      
      - name: Parse ZAP results
        id: parse-zap
        run: |
          CRITICAL=$(jq '[.site[].alerts[] | select(.riskcode=="3")] | length' report_json.json)
          HIGH=$(jq '[.site[].alerts[] | select(.riskcode=="2")] | length' report_json.json)
          
          echo "critical=$CRITICAL" >> $GITHUB_OUTPUT
          echo "high=$HIGH" >> $GITHUB_OUTPUT
          
          if [ "$CRITICAL" -gt 0 ] || [ "$HIGH" -gt 0 ]; then
            echo "❌ Found $CRITICAL critical and $HIGH high severity vulnerabilities"
            exit 1
          fi
      
      - name: Create GitHub Issue for vulnerabilities
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const report = JSON.parse(fs.readFileSync('report_json.json', 'utf8'));
            
            const criticalAlerts = report.site[0].alerts.filter(a => a.riskcode === "3");
            const highAlerts = report.site[0].alerts.filter(a => a.riskcode === "2");
            
            let body = "## DAST Scan Results\n\n";
            body += `**Critical:** ${criticalAlerts.length}\n`;
            body += `**High:** ${highAlerts.length}\n\n`;
            body += "### Critical Vulnerabilities\n\n";
            
            criticalAlerts.forEach(alert => {
              body += `- **${alert.name}** (${alert.cweid})\n`;
              body += `  - Description: ${alert.desc}\n`;
              body += `  - Solution: ${alert.solution}\n\n`;
            });
            
            await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `🚨 DAST Scan Failed: ${criticalAlerts.length} Critical, ${highAlerts.length} High`,
              body: body,
              labels: ['security', 'dast', 'vulnerability']
            });
```

### Validation Test Cases

**Test Case D.3.1: Detect Authentication Bypass**

**Objective**: Verify DAST detects authentication bypass vulnerabilities

**Procedure**:
1. Deploy staging environment with authentication bypass vulnerability
2. Run DAST scan
3. Verify scan detects authentication bypass

**Expected Result**: DAST scan detects vulnerability, severity CRITICAL

**Test Case D.3.2: Detect SQL Injection (Runtime)**

**Objective**: Verify DAST detects SQL injection through runtime testing

**Procedure**:
1. Deploy staging environment with SQL injection vulnerability
2. Run DAST scan with SQL injection payloads
3. Verify scan detects SQL injection

**Expected Result**: DAST scan detects SQL injection, severity HIGH

---

## D.4: Secrets Management

### Purpose

Secrets Management prevents hardcoded credentials, API keys, and other sensitive data from being committed to source code. This control is **critical** for preventing credential theft and unauthorized access.

### Control Specification

**Control ID**: D.4  
**Priority**: P0 (Critical)  
**Validation**: Automated scanning + manual audit

**Requirements**:
1. Zero plaintext secrets in source code, configuration files, or environment files committed to Git
2. All secrets must be stored in a secrets management system (HashiCorp Vault, AWS Secrets Manager, Azure Key Vault)
3. Secrets must be rotated at least every 90 days
4. Access to secrets must be logged and auditable
5. Secrets must be encrypted at rest and in transit

### Implementation Guide

**Step 1: Select Secrets Management System**

Recommended systems:

| System | Type | Strengths | Weaknesses |
|--------|------|-----------|------------|
| **HashiCorp Vault** | Commercial/OSS | Highly flexible, audit logging, dynamic secrets | Complex setup, requires dedicated infrastructure |
| **AWS Secrets Manager** | Cloud SaaS | Native AWS integration, automatic rotation | AWS-only |
| **Azure Key Vault** | Cloud SaaS | Native Azure integration, HSM support | Azure-only |
| **Doppler** | Commercial SaaS | Simple UI, multi-environment support | Limited enterprise features |

**Recommendation**: Use **HashiCorp Vault** for maximum flexibility and audit capabilities.

**Step 2: Configure Secrets Management**

Example HashiCorp Vault configuration:

```hcl
# vault-config.hcl

storage "file" {
  path = "/vault/data"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_cert_file = "/vault/tls/vault.crt"
  tls_key_file  = "/vault/tls/vault.key"
}

api_addr = "https://vault.secureplaywrightmcp.example.com:8200"
cluster_addr = "https://vault.secureplaywrightmcp.example.com:8201"

ui = true

# Enable audit logging
audit "file" {
  path = "/vault/logs/audit.log"
  log_raw = false
  format = "json"
}

# Enable Prometheus metrics
telemetry {
  prometheus_retention_time = "30s"
  disable_hostname = false
}
```

**Step 3: Configure Secret Scanning**

Use **TruffleHog** or **GitGuardian** to scan for accidentally committed secrets:

```yaml
# .github/workflows/secret-scan.yml
name: Secret Scan

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  trufflehog:
    name: TruffleHog Secret Scan
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for comprehensive scan
      
      - name: Run TruffleHog
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: ${{ github.event.repository.default_branch }}
          head: HEAD
          extra_args: --debug --only-verified
      
      - name: Fail on secrets found
        if: steps.trufflehog.outputs.has_secrets == 'true'
        run: |
          echo "❌ Secrets detected in commit history!"
          echo "Please remove secrets and force-push cleaned history"
          exit 1
```

**Step 4: Implement Secret Rotation**

Example secret rotation script:

```typescript
// scripts/rotate-secrets.ts

import { VaultClient } from '@hashicorp/vault-client';

const vault = new VaultClient({
  endpoint: process.env.VAULT_ADDR,
  token: process.env.VAULT_TOKEN,
});

async function rotateSecret(path: string, generator: () => Promise<string>) {
  // Read current secret
  const current = await vault.read(path);
  
  // Generate new secret
  const newSecret = await generator();
  
  // Write new secret to Vault
  await vault.write(path, { value: newSecret });
  
  // Log rotation event
  console.log(`✅ Rotated secret at ${path}`);
  
  // Notify dependent services
  await notifyServices(path, newSecret);
}

async function rotateAllSecrets() {
  const secrets = [
    { path: 'secret/playwright-mcp/api-key', generator: generateApiKey },
    { path: 'secret/playwright-mcp/db-password', generator: generatePassword },
    { path: 'secret/playwright-mcp/jwt-secret', generator: generateJwtSecret },
  ];
  
  for (const secret of secrets) {
    await rotateSecret(secret.path, secret.generator);
  }
}

rotateAllSecrets().catch(console.error);
```

### Validation Test Cases

**Test Case D.4.1: Detect Hardcoded Secret**

**Objective**: Verify secret scanning detects hardcoded secrets

**Procedure**:
1. Create branch with hardcoded API key in code
2. Push branch and create PR
3. Verify secret scan fails and blocks PR

**Expected Result**: Secret scan detects hardcoded secret, PR blocked

**Test Case D.4.2: Verify Secret Rotation**

**Objective**: Verify secrets are rotated according to policy

**Procedure**:
1. Check age of all secrets in Vault
2. Verify no secrets older than 90 days
3. Verify rotation audit log entries

**Expected Result**: All secrets rotated within 90 days, audit log complete

---

## D.5: Secure Code Review

### Purpose

Secure Code Review ensures that all code changes are reviewed by at least two independent reviewers with security expertise before being merged to the main branch. This control prevents malicious code injection and detects security vulnerabilities missed by automated tools.

### Control Specification

**Control ID**: D.5  
**Priority**: P0 (Critical)  
**Validation**: Manual audit of PR history

**Requirements**:
1. All code changes must be reviewed by at least 2 independent reviewers before merging
2. At least one reviewer must have security training or certification
3. Reviewers must explicitly approve security-sensitive changes (authentication, authorization, cryptography, secrets management)
4. Review comments must be addressed before merging
5. Review history must be preserved for audit purposes

### Implementation Guide

**Step 1: Configure Branch Protection**

Example GitHub branch protection rules:

```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Security Scan",
      "CodeQL Analysis",
      "Software Composition Analysis"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismissal_restrictions": {
      "users": [],
      "teams": ["security-team"]
    },
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 2,
    "require_last_push_approval": true
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": false
}
```

**Step 2: Create Code Review Checklist**

Example security code review checklist (`.github/PULL_REQUEST_TEMPLATE.md`):

```markdown
## Security Code Review Checklist

**Reviewer 1**: [ ] @reviewer1  
**Reviewer 2**: [ ] @reviewer2

### General Security
- [ ] No hardcoded secrets, passwords, or API keys
- [ ] No use of `eval()`, `Function()`, or similar dynamic code execution
- [ ] No SQL queries constructed with string concatenation
- [ ] No user input directly embedded in HTML without sanitization
- [ ] No sensitive data logged to console or files

### Authentication & Authorization
- [ ] Authentication required for all protected endpoints
- [ ] Authorization checks enforce least-privilege access
- [ ] Session tokens properly validated and expired
- [ ] Multi-factor authentication enforced where required

### Data Protection
- [ ] Sensitive data encrypted at rest and in transit
- [ ] TLS 1.3 used for all network communication
- [ ] No sensitive data in URL parameters or query strings
- [ ] Data validation and sanitization for all user inputs

### Dependencies
- [ ] New dependencies reviewed and approved by security team
- [ ] All dependencies scanned for known vulnerabilities
- [ ] Dependency versions pinned (no `^` or `~` in package.json)

### Error Handling
- [ ] Errors logged without exposing sensitive information
- [ ] Generic error messages returned to users
- [ ] Stack traces not exposed in production

### Testing
- [ ] Unit tests cover security-critical code paths
- [ ] Integration tests validate authentication and authorization
- [ ] Security test cases added for new features

### Documentation
- [ ] Security implications documented in README or SECURITY.md
- [ ] API documentation updated with authentication requirements
- [ ] Changelog updated with security-relevant changes

---

**Reviewer Confirmation**:
- [ ] I have reviewed this code for security vulnerabilities
- [ ] I approve this code for merging to main branch

**Reviewer 1**: ________________  
**Reviewer 2**: ________________
```

**Step 3: Implement CODEOWNERS**

Example CODEOWNERS file (`.github/CODEOWNERS`):

```
# Security-sensitive files require security team review

# Authentication and authorization
/server/auth.ts @security-team
/server/_core/oauth.ts @security-team
/server/_core/context.ts @security-team

# Secrets and configuration
/server/_core/env.ts @security-team
/.env.example @security-team
/vault-config.hcl @security-team

# Cryptography
/server/_core/crypto.ts @security-team
/server/encryption.ts @security-team

# Database
/drizzle/schema.ts @security-team @database-team
/server/db.ts @security-team @database-team

# CI/CD and security scanning
/.github/workflows/*.yml @security-team @devops-team
/.semgrep/ @security-team
/.snyk @security-team

# Default: all files require at least 2 reviewers
* @dev-team @security-team
```

### Validation Test Cases

**Test Case D.5.1: Enforce Two-Reviewer Requirement**

**Objective**: Verify PRs cannot be merged with fewer than 2 approvals

**Procedure**:
1. Create PR with code changes
2. Obtain 1 approval
3. Attempt to merge PR

**Expected Result**: Merge blocked, message indicates 2 approvals required

**Test Case D.5.2: Require Security Team Review**

**Objective**: Verify security-sensitive files require security team review

**Procedure**:
1. Create PR modifying `/server/auth.ts`
2. Obtain 2 approvals from non-security team members
3. Attempt to merge PR

**Expected Result**: Merge blocked, message indicates security team review required

---

## Summary

Layer 4 (Application Security) provides **critical defenses** against supply chain attacks, code injection, and credential theft. The controls in this appendix must be implemented **before production deployment** to ensure SecurePlaywrightMCP meets enterprise security standards.

### Implementation Priority

**Phase 1 (P0 Controls)**:
- D.1: Software Composition Analysis
- D.4: Secrets Management
- D.5: Secure Code Review
- D.2: Static Application Security Testing

**Phase 2 (P1 Controls)**:
- D.3: Dynamic Application Security Testing
- D.6: Dependency Pinning and Verification
- D.7: Build Reproducibility
- D.8: Security Testing in CI/CD

### Next Steps

1. Review this appendix with ITS Security Team
2. Select and procure security tooling (Snyk, CodeQL, OWASP ZAP, HashiCorp Vault)
3. Configure CI/CD pipeline with security scanning
4. Train development team on secure coding practices
5. Conduct initial security audit and remediate findings

---

**End of Appendix D**

*For additional security layers, refer to Appendices E (Data Security), F (Identity and Access Management), and G (Physical and Supply Chain Security).*
