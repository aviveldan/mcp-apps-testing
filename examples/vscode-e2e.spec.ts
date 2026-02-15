/**
 * Layer 3 — VS Code E2E Testing with Copilot Chat + MCP
 *
 * These tests demonstrate the full MCP ext-app flow inside VS Code:
 *   1. Launch VS Code in a clean-room (fresh workspace, only Copilot extension)
 *   2. Configure an MCP server
 *   3. Open Copilot Chat (Agent mode)
 *   4. Send a prompt that triggers an MCP tool call
 *   5. Allow the tool invocation
 *   6. Assert on the response
 *
 * Prerequisites:
 *   - VS Code installed with GitHub Copilot Chat extension
 *   - Copilot authenticated (uses your real VS Code user-data for auth)
 *   - On Linux: xvfb-run wrapper (see docs/vscode-e2e-testing.md)
 *
 * Run:
 *   VSCODE_E2E=1 npx playwright test examples/vscode-e2e.spec.ts
 *
 * These tests are NOT part of the default test suite — they require VS Code
 * and are intended for nightly / release-gate pipelines.
 */

import { test, expect } from '@playwright/test';
import { VSCodeHost } from '../src';
import * as path from 'path';
import * as fs from 'fs';

// Skip unless VSCODE_E2E env var is set
const describeVSCode = process.env.VSCODE_E2E ? test.describe : test.describe.skip;

describeVSCode('Layer 3: VS Code E2E', () => {
  test.setTimeout(120_000);
  // VS Code tests must run serially — they share the real user-data-dir for auth
  test.describe.configure({ mode: 'serial' });

  let host: VSCodeHost;

  // Create a minimal MCP server that returns a greeting
  function createTestServer(dir: string): string {
    const serverScript = `
process.stdin.setEncoding('utf8');
let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\\n');
  buffer = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    try { handleMessage(JSON.parse(line)); } catch {}
  }
});
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\\n'); }
function handleMessage(msg) {
  if (msg.method === 'initialize') {
    send({ jsonrpc: '2.0', id: msg.id, result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'test-server', version: '1.0.0' },
    }});
  } else if (msg.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: msg.id, result: { tools: [{
      name: 'greet',
      description: 'Returns a greeting for the given name',
      inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
    }]}});
  } else if (msg.method === 'tools/call') {
    const name = msg.params?.arguments?.name || 'World';
    send({ jsonrpc: '2.0', id: msg.id, result: {
      content: [{ type: 'text', text: 'Hello, ' + name + '! Greetings from the test MCP server.' }],
    }});
  }
}`;
    const serverPath = path.join(dir, 'test-server.js');
    fs.writeFileSync(serverPath, serverScript);
    return serverPath;
  }

  test.afterEach(async () => {
    if (host) {
      await host.cleanup();
    }
  });

  test('launches clean VS Code with only Copilot', async () => {
    host = await VSCodeHost.launch({ debug: true });

    const window = host.getWindow();
    await expect(window.locator('.monaco-workbench')).toBeVisible();
    await expect(window.locator('.statusbar')).toBeVisible();
  });

  test('configures MCP server and opens Agent chat', async () => {
    host = await VSCodeHost.launch();

    const serverPath = createTestServer(host.getWorkspaceDir());

    await host.configureMCPServer('test-server', {
      type: 'stdio',
      command: 'node',
      args: [serverPath],
    });

    const chat = await host.openChat('agent');
    // Chat panel should be visible with the input editor
    await expect(host.getWindow().locator('.interactive-session')).toBeVisible();
  });

  test('full MCP tool call through Copilot Chat', async () => {
    host = await VSCodeHost.launch();

    const serverPath = createTestServer(host.getWorkspaceDir());

    await host.configureMCPServer('test-server', {
      type: 'stdio',
      command: 'node',
      args: [serverPath],
    });

    // Open agent chat and send a prompt
    const chat = await host.openChat('agent');
    await chat.send('Use the greet tool with name "E2E-Test". Only call the tool, do not add anything else.');

    // Wait for the tool confirmation dialog and allow it
    await chat.allowTool(30000);

    // Wait for the response to finish
    const response = await chat.waitForResponse(30000);

    // The response should contain the greeting from our MCP server
    await expect(response).toContainText('Hello, E2E-Test');
  });

  test('takes screenshot of VS Code with chat', async () => {
    host = await VSCodeHost.launch();
    await host.openChat('agent');

    const screenshot = await host.screenshot(
      path.resolve(__dirname, '../test-results/vscode-chat-screenshot.png')
    );
    expect(screenshot).toBeInstanceOf(Buffer);
  });
});
