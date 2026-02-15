/**
 * ReferenceHost — A minimal, honest browser sandbox for MCP ext-app E2E testing.
 *
 * This is NOT a simulation of Claude or VS Code. It is a spec-compliant reference
 * implementation of the host side of the MCP ext-app postMessage protocol. Use it
 * to validate UI rendering, iframe sandboxing, theme injection, and host↔app
 * messaging in a real browser — without needing a real IDE installed.
 *
 * For real client-specific testing, use actual VS Code / Claude Desktop containers.
 */

import type { Page, FrameLocator } from '@playwright/test';
import type { JSONRPCRequest, JSONRPCResponse, JSONRPCNotification } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export interface ReferenceHostOptions {
  /** Sandbox attributes for the app iframe (default: 'allow-scripts allow-same-origin') */
  sandbox?: string;
  /** Initial theme CSS variables to inject */
  theme?: Record<string, string>;
  /** Viewport size for the iframe */
  viewport?: { width: number; height: number };
  /** Whether to log postMessage traffic to the browser console */
  debug?: boolean;
}

const HOST_ORIGIN = 'https://mcp-reference-host.test';

/**
 * Drives a reference host page in Playwright that loads an MCP app in an iframe
 * and communicates via the postMessage protocol.
 *
 * Both the host page and the app are served through Playwright route interception
 * on the same origin, avoiding cross-origin restrictions.
 */
export class ReferenceHost {
  private page: Page;
  private options: ReferenceHostOptions;

  private constructor(page: Page, options: ReferenceHostOptions) {
    this.page = page;
    this.options = options;
  }

  /**
   * Launch the reference host: set up Playwright routes to serve the host page
   * and the app from the same origin, then navigate.
   */
  static async launch(
    page: Page,
    appUrl: string,
    options: ReferenceHostOptions = {}
  ): Promise<ReferenceHost> {
    const host = new ReferenceHost(page, options);

    // Route the app through the same origin
    const appRoute = `${HOST_ORIGIN}/app`;
    await host.routeApp(page, appUrl, appRoute);

    // Route the host page
    const html = host.generateHostHTML(appRoute);
    await page.route(`${HOST_ORIGIN}/`, async (route) => {
      await route.fulfill({ body: html, contentType: 'text/html' });
    });

    await page.goto(`${HOST_ORIGIN}/`);

    // Wait for the iframe to signal it has loaded
    await page.waitForFunction(
      () => (window as unknown as { __iframeLoaded: boolean }).__iframeLoaded === true,
      { timeout: 10000 }
    );

    return host;
  }

  /**
   * Get a Playwright FrameLocator for the app iframe — use this
   * to query/assert on the app's rendered UI.
   */
  getAppFrame(): FrameLocator {
    return this.page.frameLocator('#mcp-app-frame');
  }

  /**
   * Send a JSON-RPC message (response or notification) from the host into the app iframe.
   */
  async sendMessage(message: JSONRPCResponse | JSONRPCNotification): Promise<void> {
    await this.page.evaluate((msg) => {
      const iframe = document.getElementById('mcp-app-frame') as HTMLIFrameElement;
      iframe.contentWindow?.postMessage(msg, '*');
    }, message);
  }

  /**
   * Get all messages received from the app (via postMessage).
   */
  async getReceivedMessages(): Promise<JSONRPCRequest[]> {
    return await this.page.evaluate(() => {
      return (window as unknown as { __mcpReceivedMessages: JSONRPCRequest[] }).__mcpReceivedMessages || [];
    });
  }

  /**
   * Wait for the app to send a message with the given JSON-RPC method.
   */
  async waitForMessage(method: string, timeout = 5000): Promise<JSONRPCRequest> {
    return await this.page.evaluate(
      ({ method: m, timeout: t }) => {
        return new Promise<JSONRPCRequest>((resolve, reject) => {
          const deadline = setTimeout(
            () => reject(new Error(`Timeout waiting for message "${m}"`)),
            t
          );

          // Check already-received messages
          const received = (window as unknown as { __mcpReceivedMessages: JSONRPCRequest[] })
            .__mcpReceivedMessages || [];
          const existing = received.find((msg: JSONRPCRequest) => msg.method === m);
          if (existing) {
            clearTimeout(deadline);
            resolve(existing);
            return;
          }

          // Listen for future messages
          const handler = (event: MessageEvent) => {
            if (event.data?.method === m) {
              clearTimeout(deadline);
              window.removeEventListener('message', handler);
              resolve(event.data);
            }
          };
          window.addEventListener('message', handler);
        });
      },
      { method, timeout }
    );
  }

  /**
   * Inject or update theme CSS variables on the app iframe.
   */
  async setTheme(variables: Record<string, string>): Promise<void> {
    await this.page.evaluate((vars) => {
      const iframe = document.getElementById('mcp-app-frame') as HTMLIFrameElement;
      const doc = iframe.contentDocument;
      if (!doc) return;

      let styleEl = doc.getElementById('mcp-theme-vars') as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = doc.createElement('style');
        styleEl.id = 'mcp-theme-vars';
        doc.head.appendChild(styleEl);
      }

      const css = Object.entries(vars)
        .map(([k, v]) => `${k}: ${v};`)
        .join(' ');
      styleEl.textContent = `:root { ${css} }`;
    }, variables);
  }

  /**
   * Clear all recorded messages.
   */
  async clearMessages(): Promise<void> {
    await this.page.evaluate(() => {
      (window as unknown as { __mcpReceivedMessages: unknown[] }).__mcpReceivedMessages = [];
    });
  }

  /**
   * Clean up the reference host.
   */
  async cleanup(): Promise<void> {
    await this.page.evaluate(() => {
      (window as unknown as { __mcpReceivedMessages: unknown[] }).__mcpReceivedMessages = [];
    });
  }

  // ── Private ──────────────────────────────────────────────────

  /**
   * Set up a Playwright route to serve the app content from the same origin.
   */
  private async routeApp(page: Page, appUrl: string, appRoute: string): Promise<void> {
    if (appUrl.startsWith('file://')) {
      const filePath = appUrl.replace(/^file:\/\/\/?/, '');
      const normalizedPath = path.resolve(filePath);
      await page.route(appRoute, async (route) => {
        const content = fs.readFileSync(normalizedPath, 'utf-8');
        await route.fulfill({ body: content, contentType: 'text/html' });
      });
    } else if (appUrl.startsWith('data:')) {
      const content = decodeURIComponent(appUrl.split(',').slice(1).join(','));
      await page.route(appRoute, async (route) => {
        await route.fulfill({ body: content, contentType: 'text/html' });
      });
    } else {
      // For http(s) URLs, proxy through the same origin
      await page.route(appRoute, async (route) => {
        const response = await page.request.get(appUrl);
        await route.fulfill({ response });
      });
    }
  }

  /**
   * Generate the reference host HTML page.
   */
  private generateHostHTML(appRoute: string): string {
    const sandbox = this.options.sandbox ?? 'allow-scripts allow-same-origin';
    const debug = this.options.debug ?? false;
    const width = this.options.viewport?.width ?? 800;
    const height = this.options.viewport?.height ?? 600;

    const themeStyle = this.options.theme
      ? `:root { ${Object.entries(this.options.theme)
          .filter(([k]) => k.startsWith('--'))
          .map(([k, v]) => `${k}: ${this.escapeCssValue(v)}`)
          .join('; ')}; }`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MCP Reference Host</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #f5f5f5; padding: 8px; }
    #mcp-app-frame { border: 1px solid #ccc; background: #fff; }
    ${themeStyle}
  </style>
</head>
<body>
  <iframe
    id="mcp-app-frame"
    src="${this.escapeHtml(appRoute)}"
    sandbox="${sandbox}"
    width="${width}"
    height="${height}"
  ></iframe>

  <script>
    window.__mcpReceivedMessages = [];
    window.__iframeLoaded = false;

    document.getElementById('mcp-app-frame').addEventListener('load', function() {
      window.__iframeLoaded = true;
    });

    window.addEventListener('message', function(event) {
      if (event.data && typeof event.data === 'object' && event.data.jsonrpc === '2.0') {
        window.__mcpReceivedMessages.push(event.data);
        ${debug ? "console.log('[ReferenceHost] Received from app:', JSON.stringify(event.data));" : ''}
      }
    });
  </script>
</body>
</html>`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Sanitize CSS values to prevent CSS injection attacks.
   * Removes characters that could break out of CSS context or enable attacks.
   * Preserves characters valid in CSS values like #, -, hex colors, etc.
   */
  private escapeCssValue(str: string): string {
    // Remove characters that could break out of CSS context or enable injection:
    // - } closes the CSS rule block
    // - ; terminates the CSS declaration
    // - " and ' could close string contexts
    // - \ starts escape sequences
    // - < and > for script tag prevention
    // - { for block injection
    // - ( and ) for url() and calc() injection
    // - / for comment /* */ injection
    // - newlines/carriage returns for multi-line injection
    return str
      .replace(/[{};"'\\<>()/\r\n]/g, '');
  }
}
