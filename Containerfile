# SecurePlaywrightMCP Containerfile
# Hardened container image for Podman rootless deployment
#
# Build: podman build -t secureplaywrightmcp:latest -f Containerfile .
# Run: podman run --config=config/podman-rootless.yaml secureplaywrightmcp:latest

# Use official Node.js LTS image (minimal attack surface)
FROM docker.io/library/node:20-alpine3.20

# Security metadata
LABEL maintainer="SecurePlaywrightMCP Team"
LABEL description="Hardened Playwright MCP with Podman rootless containers"
LABEL security.compliance.nist="PR.AC-4,PR.AC-1,PR.AC-5"
LABEL security.compliance.iso27001="A.9.2.3,A.9.1.1,A.13.1.3"
LABEL security.compliance.soc2="CC6.3,CC6.1,CC6.6"
LABEL security.compliance.pcidss="7.1.2,7.1,2.2.1"

# Install security updates and minimal dependencies
RUN apk update && \
    apk upgrade && \
    apk add --no-cache \
        dumb-init \
        ca-certificates \
        && \
    rm -rf /var/cache/apk/*

# Create non-root user (UID 1000)
RUN addgroup -g 1000 playwright && \
    adduser -D -u 1000 -G playwright playwright

# Set working directory
WORKDIR /app

# Copy package files
COPY --chown=playwright:playwright package.json package-lock.json ./

# Install dependencies (production only, no dev dependencies)
RUN npm ci --only=production && \
    npm cache clean --force

# Install Playwright browsers (Chromium only for minimal attack surface)
RUN npx playwright install --with-deps chromium && \
    rm -rf /root/.cache

# Copy application code
COPY --chown=playwright:playwright dist ./dist
COPY --chown=playwright:playwright config ./config

# Create data directory
RUN mkdir -p /data && chown playwright:playwright /data

# Switch to non-root user
USER playwright

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node /app/healthcheck.js || exit 1

# Expose MCP port (will be mapped by Podman)
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start SecurePlaywrightMCP
CMD ["node", "dist/index.js"]
