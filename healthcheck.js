#!/usr/bin/env node

/**
 * SecurePlaywrightMCP Health Check
 * 
 * Validates that the MCP server is running and responsive.
 * Used by Podman/Kubernetes health checks.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function healthCheck() {
  try {
    // Check if Node.js process is running
    const { stdout } = await execAsync('pgrep -f "node.*index.js"');
    
    if (!stdout.trim()) {
      console.error('Health check failed: MCP server process not found');
      process.exit(1);
    }

    // Check memory usage (fail if > 1.8GB to prevent OOM)
    const memInfo = await execAsync('cat /proc/meminfo');
    const memAvailable = parseInt(
      memInfo.stdout.match(/MemAvailable:\\s+(\\d+)/)?.[1] || '0'
    );
    
    if (memAvailable < 200000) { // Less than 200MB available
      console.error('Health check failed: Low memory');
      process.exit(1);
    }

    console.log('Health check passed');
    process.exit(0);
  } catch (error) {
    console.error('Health check failed:', error);
    process.exit(1);
  }
}

healthCheck();
