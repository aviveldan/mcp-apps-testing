/**
 * Layer 3 — VS Code Container E2E Testing
 *
 * These tests demonstrate VSCodeHost: a real VS Code instance controlled by
 * Playwright's Electron support. Use this to catch host-specific bugs that
 * the ReferenceHost sandbox cannot reproduce.
 *
 * Prerequisites:
 *   - VS Code installed (or @vscode/test-electron for auto-download)
 *   - On Linux CI: xvfb-run wrapper (see docs/vscode-e2e-testing.md)
 *
 * Run:
 *   VSCODE_E2E=1 npx playwright test examples/vscode-e2e.spec.ts
 *
 * These tests are NOT part of the default test suite — they require VS Code
 * and are intended for nightly / release-gate CI pipelines.
 */

import { test, expect } from '@playwright/test';
import { VSCodeHost } from '../src';
import * as path from 'path';

// Skip these tests unless VSCODE_E2E env var is set
const describeVSCode = process.env.VSCODE_E2E ? test.describe : test.describe.skip;

describeVSCode('Layer 3: VS Code E2E', () => {
  // VS Code launches are slower than browser tests
  test.setTimeout(120_000);

  let host: VSCodeHost;

  test.afterEach(async () => {
    if (host) {
      await host.cleanup();
    }
  });

  test('launches VS Code and waits for workbench', async () => {
    host = await VSCodeHost.launch({
      debug: true,
      launchTimeout: 60000,
    });

    const window = host.getWindow();
    await expect(window.locator('.monaco-workbench')).toBeVisible();
  });

  test('runs a command via the command palette', async () => {
    host = await VSCodeHost.launch({
      launchTimeout: 60000,
    });

    // Run a built-in command
    await host.runCommand('Toggle Terminal');

    // Terminal panel should appear
    const window = host.getWindow();
    await expect(window.locator('.terminal')).toBeVisible({ timeout: 10000 });
  });

  test('loads extension and opens webview', async () => {
    // This test requires an actual extension — update the path to your extension
    const extensionPath = process.env.EXTENSION_DEV_PATH;
    test.skip(!extensionPath, 'Set EXTENSION_DEV_PATH to run this test');

    host = await VSCodeHost.launch({
      extensionDevelopmentPath: extensionPath!,
      workspacePath: process.env.WORKSPACE_PATH,
      launchTimeout: 60000,
    });

    // Trigger the MCP ext-app command (update to your command ID)
    const command = process.env.MCP_COMMAND || 'myExtension.openMCPApp';
    await host.runCommand(command);

    // Wait for the webview to appear
    const webview = await host.waitForWebview({
      tabTitle: process.env.WEBVIEW_TITLE || 'MCP App',
      timeout: 15000,
    });

    // Assert on the ext-app UI rendered inside VS Code
    await expect(webview.locator('body')).toBeVisible();
  });

  test('takes a screenshot of VS Code', async () => {
    host = await VSCodeHost.launch({
      launchTimeout: 60000,
    });

    const window = host.getWindow();
    await expect(window.locator('.monaco-workbench')).toBeVisible();

    const screenshot = await host.screenshot(
      path.resolve(__dirname, '../test-results/vscode-screenshot.png')
    );
    expect(screenshot).toBeInstanceOf(Buffer);
  });
});
