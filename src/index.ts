#!/usr/bin/env node

/**
 * SecurePlaywrightMCP - Hardened Playwright MCP Server
 * 
 * Enterprise-grade browser automation with defense-in-depth security:
 * - Podman rootless containers
 * - Custom seccomp profiles
 * - SELinux enforcement
 * - Capability dropping
 * - Read-only root filesystem
 * 
 * @license MIT
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { z } from 'zod';

// Security configuration
const SECURITY_CONFIG = {
  maxPages: 10,
  maxNavigationTime: 30000,
  maxActionTime: 10000,
  allowedDomains: process.env.ALLOWED_DOMAINS?.split(',') || [],
  blockDangerousAPIs: true,
};

// Browser state management
let browser: Browser | null = null;
let context: BrowserContext | null = null;
const pages: Map<string, Page> = new Map();

/**
 * Initialize browser with security hardening
 */
async function initBrowser(): Promise<void> {
  if (browser) return;

  browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox', // Running in container, sandbox handled by Podman
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-sync',
      '--disable-translate',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-default-browser-check',
      '--safebrowsing-disable-auto-update',
    ],
  });

  context = await browser.newContext({
    ignoreHTTPSErrors: false,
    javaScriptEnabled: true,
    acceptDownloads: false,
    permissions: [], // No permissions granted
  });

  // Block dangerous APIs
  if (SECURITY_CONFIG.blockDangerousAPIs) {
    await context.route('**/*', (route) => {
      const url = route.request().url();
      
      // Block file:// protocol
      if (url.startsWith('file://')) {
        route.abort();
        return;
      }

      // Domain whitelist enforcement
      if (SECURITY_CONFIG.allowedDomains.length > 0) {
        const allowed = SECURITY_CONFIG.allowedDomains.some((domain) =>
          url.includes(domain)
        );
        if (!allowed) {
          route.abort();
          return;
        }
      }

      route.continue();
    });
  }
}

/**
 * Cleanup resources
 */
async function cleanup(): Promise<void> {
  for (const page of pages.values()) {
    await page.close().catch(() => {});
  }
  pages.clear();

  if (context) {
    await context.close().catch(() => {});
    context = null;
  }

  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
}

/**
 * Main MCP server
 */
async function main() {
  const server = new Server(
    {
      name: 'secureplaywrightmcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'navigate',
        description: 'Navigate to a URL',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL to navigate to',
            },
            pageId: {
              type: 'string',
              description: 'Page identifier (optional, creates new page if not provided)',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'click',
        description: 'Click an element',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: {
              type: 'string',
              description: 'Page identifier',
            },
            selector: {
              type: 'string',
              description: 'CSS selector or text content',
            },
          },
          required: ['pageId', 'selector'],
        },
      },
      {
        name: 'fill',
        description: 'Fill an input field',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: {
              type: 'string',
              description: 'Page identifier',
            },
            selector: {
              type: 'string',
              description: 'CSS selector',
            },
            value: {
              type: 'string',
              description: 'Value to fill',
            },
          },
          required: ['pageId', 'selector', 'value'],
        },
      },
      {
        name: 'screenshot',
        description: 'Take a screenshot',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: {
              type: 'string',
              description: 'Page identifier',
            },
            fullPage: {
              type: 'boolean',
              description: 'Capture full page (default: false)',
            },
          },
          required: ['pageId'],
        },
      },
      {
        name: 'evaluate',
        description: 'Execute JavaScript in page context',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: {
              type: 'string',
              description: 'Page identifier',
            },
            script: {
              type: 'string',
              description: 'JavaScript code to execute',
            },
          },
          required: ['pageId', 'script'],
        },
      },
      {
        name: 'close_page',
        description: 'Close a page',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: {
              type: 'string',
              description: 'Page identifier',
            },
          },
          required: ['pageId'],
        },
      },
    ],
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    await initBrowser();

    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'navigate': {
          const { url, pageId } = args as { url: string; pageId?: string };
          
          let page: Page;
          if (pageId && pages.has(pageId)) {
            page = pages.get(pageId)!;
          } else {
            // Enforce max pages limit
            if (pages.size >= SECURITY_CONFIG.maxPages) {
              throw new Error(`Maximum number of pages (${SECURITY_CONFIG.maxPages}) reached`);
            }
            
            page = await context!.newPage();
            const newPageId = pageId || `page-${Date.now()}`;
            pages.set(newPageId, page);
          }

          await page.goto(url, {
            timeout: SECURITY_CONFIG.maxNavigationTime,
            waitUntil: 'domcontentloaded',
          });

          return {
            content: [
              {
                type: 'text',
                text: `Navigated to ${url}`,
              },
            ],
          };
        }

        case 'click': {
          const { pageId, selector } = args as { pageId: string; selector: string };
          const page = pages.get(pageId);
          if (!page) throw new Error(`Page ${pageId} not found`);

          await page.click(selector, { timeout: SECURITY_CONFIG.maxActionTime });

          return {
            content: [
              {
                type: 'text',
                text: `Clicked ${selector}`,
              },
            ],
          };
        }

        case 'fill': {
          const { pageId, selector, value } = args as {
            pageId: string;
            selector: string;
            value: string;
          };
          const page = pages.get(pageId);
          if (!page) throw new Error(`Page ${pageId} not found`);

          await page.fill(selector, value, { timeout: SECURITY_CONFIG.maxActionTime });

          return {
            content: [
              {
                type: 'text',
                text: `Filled ${selector} with value`,
              },
            ],
          };
        }

        case 'screenshot': {
          const { pageId, fullPage } = args as { pageId: string; fullPage?: boolean };
          const page = pages.get(pageId);
          if (!page) throw new Error(`Page ${pageId} not found`);

          const screenshot = await page.screenshot({
            fullPage: fullPage || false,
            type: 'png',
          });

          return {
            content: [
              {
                type: 'image',
                data: screenshot.toString('base64'),
                mimeType: 'image/png',
              },
            ],
          };
        }

        case 'evaluate': {
          const { pageId, script } = args as { pageId: string; script: string };
          const page = pages.get(pageId);
          if (!page) throw new Error(`Page ${pageId} not found`);

          const result = await page.evaluate(script);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'close_page': {
          const { pageId } = args as { pageId: string };
          const page = pages.get(pageId);
          if (!page) throw new Error(`Page ${pageId} not found`);

          await page.close();
          pages.delete(pageId);

          return {
            content: [
              {
                type: 'text',
                text: `Closed page ${pageId}`,
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('SecurePlaywrightMCP server running');

  // Cleanup on exit
  process.on('SIGINT', async () => {
    await cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await cleanup();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
