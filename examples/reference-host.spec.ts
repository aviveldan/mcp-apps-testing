import { test, expect } from '@playwright/test';
import { ReferenceHost } from '../src';
import * as path from 'path';

/**
 * Layer 2 — Reference Host Sandbox E2E Testing
 *
 * These tests demonstrate the ReferenceHost: a real browser sandbox that loads
 * MCP apps in an iframe and communicates via the postMessage protocol.
 *
 * This is NOT simulating Claude or VS Code — it is a spec-compliant reference
 * host for automated E2E testing that covers ~90% of real behavior.
 */

test.describe('Layer 2: Reference host sandbox', () => {

  function appFilePath(): string {
    return `file://${path.resolve(__dirname, 'hello-world-app.html').replace(/\\/g, '/')}`;
  }

  test('loads an MCP app in an iframe', async ({ page }) => {
    const host = await ReferenceHost.launch(page, appFilePath());

    const frame = host.getAppFrame();
    await expect(frame.locator('h1')).toContainText('Hello World MCP App');
    await expect(frame.locator('button#greetBtn')).toBeVisible();

    await host.cleanup();
  });

  test('injects theme CSS variables into the app iframe', async ({ page }) => {
    const host = await ReferenceHost.launch(page, appFilePath());

    await host.setTheme({
      '--background': '#1e1e2e',
      '--foreground': '#cdd6f4',
      '--primary': '#89b4fa',
    });

    const frame = host.getAppFrame();
    const bgVar = await frame.locator('html').evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--background').trim()
    );
    expect(bgVar).toBe('#1e1e2e');

    await host.cleanup();
  });

  test('receives postMessage from the app', async ({ page }) => {
    // Inline app that sends a JSON-RPC message on load
    const inlineApp = `data:text/html,${encodeURIComponent(`
      <!DOCTYPE html><html><body>
      <script>
        window.addEventListener('load', function() {
          window.parent.postMessage({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'hello', arguments: {} }
          }, '*');
        });
      </script>
      </body></html>
    `)}`;

    const host = await ReferenceHost.launch(page, inlineApp, {
      sandbox: 'allow-scripts allow-same-origin',
    });

    const msg = await host.waitForMessage('tools/call', 3000);
    expect(msg.method).toBe('tools/call');
    expect((msg.params as { name: string }).name).toBe('hello');

    await host.cleanup();
  });

  test('sends postMessage into the app iframe', async ({ page }) => {
    // App that listens for messages and renders them
    const inlineApp = `data:text/html,${encodeURIComponent(`
      <!DOCTYPE html><html><body>
      <div id="received"></div>
      <script>
        window.addEventListener('message', function(event) {
          if (event.data && event.data.jsonrpc === '2.0') {
            document.getElementById('received').textContent = JSON.stringify(event.data);
          }
        });
      </script>
      </body></html>
    `)}`;

    const host = await ReferenceHost.launch(page, inlineApp, {
      sandbox: 'allow-scripts allow-same-origin',
    });

    await host.sendMessage({
      jsonrpc: '2.0',
      id: 1,
      result: { content: [{ type: 'text', text: 'Hello from host' }] },
    });

    const frame = host.getAppFrame();
    await expect(frame.locator('#received')).toContainText('Hello from host');

    await host.cleanup();
  });

  test('respects iframe sandbox attributes', async ({ page }) => {
    const host = await ReferenceHost.launch(page, appFilePath(), {
      sandbox: 'allow-scripts',
    });

    const sandboxAttr = await page.locator('#mcp-app-frame').getAttribute('sandbox');
    expect(sandboxAttr).toBe('allow-scripts');

    await host.cleanup();
  });

  test('custom viewport dimensions', async ({ page }) => {
    const host = await ReferenceHost.launch(page, appFilePath(), {
      viewport: { width: 400, height: 300 },
    });

    const width = await page.locator('#mcp-app-frame').getAttribute('width');
    const height = await page.locator('#mcp-app-frame').getAttribute('height');
    expect(width).toBe('400');
    expect(height).toBe('300');

    await host.cleanup();
  });
});
