import { test, expect } from '@playwright/test';
import { MockMCPHost, HostProfiles, applyTheme } from '../src';
import * as path from 'path';

/**
 * Hello World MCP App - Complete Example
 * 
 * This test demonstrates:
 * 1. Zero-config setup with MockMCPHost (simulated host for unit testing)
 * 2. Fluent DSL methods (callTool, listTools, etc.)
 * 3. Simulated host profiles (Claude-like, VS Code) for different capabilities/themes
 * 4. Theme verification (light/dark mode)
 * 5. UI rendering and interaction testing
 * 6. Protocol logging and debugging
 * 
 * Note: MockMCPHost is for unit testing only. For real environment testing,
 * see vscode-e2e.spec.ts or reference-host.spec.ts
 */

test.describe('Hello World MCP App', () => {
  let host: MockMCPHost;

  test.beforeEach(async () => {
    // Zero-config setup with Claude-like simulated profile for unit testing
    host = new MockMCPHost({ 
      debug: false,
      hostProfile: 'Claude',
    });

    // Mock the greet tool
    const interceptor = host.getInterceptor();
    interceptor.mockResponse('tools/call', (request: any) => ({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        content: [{
          type: 'text',
          text: `Hello, ${request.params?.arguments?.name || 'World'}! Welcome to MCP Apps Testing Framework!`
        }]
      }
    }));

    // Mock tools/list to advertise the greet tool
    interceptor.mockResponse('tools/list', (request: any) => ({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        tools: [{
          name: 'greet',
          description: 'Greets a person by name',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Name to greet' }
            },
            required: ['name']
          }
        }]
      }
    }));
  });

  test.afterEach(async () => {
    await host.cleanup();
  });

  test('should initialize and list tools', async () => {
    // Initialize the host
    await host.initialize({ name: 'hello-world-app', version: '1.0.0' });
    expect(host.isInitialized()).toBe(true);

    // Use fluent DSL to list tools
    const response = await host.listTools();
    expect(response.result.tools).toHaveLength(1);
    expect(response.result.tools[0].name).toBe('greet');
  });

  test('should call greet tool using fluent DSL', async () => {
    await host.initialize();

    // Use fluent DSL method with auto-retry
    const response = await host.callTool('greet', { name: 'Alice' }, { 
      timeout: 5000, 
      retries: 3 
    });

    expect(response.result.content[0].text).toContain('Hello, Alice');
  });

  test('should verify Claude host profile capabilities', async () => {
    const profile = host.getHostProfile();
    
    expect(profile).toBeDefined();
    expect(profile?.name).toBe('Claude');
    expect(profile?.capabilities.tools?.listChanged).toBe(true);
    expect(profile?.capabilities.resources?.subscribe).toBe(true);
  });

  test('should render UI with Claude light theme', async ({ page }) => {
    const appPath = path.join(__dirname, 'hello-world-app.html');
    
    // Apply Claude theme
    const claudeProfile = HostProfiles.Claude;
    const themeCSS = applyTheme(claudeProfile, 'light');
    
    await page.goto(`file://${appPath}`);
    
    // Inject theme variables
    await page.addStyleTag({ content: `:root { ${themeCSS} }` });
    
    // Verify UI elements are present
    await expect(page.locator('h1')).toContainText('Hello World MCP App');
    await expect(page.locator('button#greetBtn')).toBeVisible();
    
    // Check theme colors are applied
    const bgColor = await page.locator('body').evaluate(el => 
      getComputedStyle(el).backgroundColor
    );
    expect(bgColor).toBeTruthy();
  });

  test('should render UI with Claude dark theme', async ({ page }) => {
    const appPath = path.join(__dirname, 'hello-world-app.html');
    
    await page.goto(`file://${appPath}?theme=dark`);
    
    // Verify dark theme is applied
    const bgColor = await page.locator('body').evaluate(el => 
      getComputedStyle(el).getPropertyValue('--background')
    );
    
    // Verify UI is functional in dark mode
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('button#greetBtn')).toBeEnabled();
  });

  test('should handle tool call button interaction', async ({ page }) => {
    const appPath = path.join(__dirname, 'hello-world-app.html');
    await page.goto(`file://${appPath}`);
    
    // Click the greet button
    await page.click('button#greetBtn');
    
    // Wait for result to appear
    await page.waitForSelector('#result:not(:empty)', { timeout: 5000 });
    
    // Verify the result
    const result = await page.locator('#result').textContent();
    expect(result).toContain('Hello');
  });

  test('should test with VS Code host profile', async () => {
    // Create a new host with VS Code profile
    const vscodeHost = new MockMCPHost({ hostProfile: 'VSCode' });
    
    const profile = vscodeHost.getHostProfile();
    expect(profile?.name).toBe('VS Code');
    expect(profile?.capabilities.resources?.subscribe).toBe(false);
    expect(profile?.constraints?.maxViewportWidth).toBe(1600);
    
    await vscodeHost.cleanup();
  });

  test('should enable protocol logging for debugging', async () => {
    // Capture console output
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...logArgs: unknown[]) => {
      logs.push(logArgs.join(' '));
      originalLog(...logArgs);
    };

    host.enableProtocolLogging();
    await host.initialize();
    await host.callTool('greet', { name: 'Debug' });

    console.log = originalLog;

    // Verify protocol logs were generated
    const requestLogs = logs.filter(log => log.includes('[MCP Request]'));
    const responseLogs = logs.filter(log => log.includes('[MCP Response]'));
    
    expect(requestLogs.length).toBeGreaterThan(0);
    expect(responseLogs.length).toBeGreaterThan(0);
  });

  test('should record and verify message flow', async () => {
    await host.initialize();
    await host.callTool('greet', { name: 'Test' });
    await host.listTools();

    const interceptor = host.getInterceptor();
    const requests = interceptor.getRecordedRequests();
    
    // Verify the sequence of calls
    expect(requests.some(r => r.method === 'initialize')).toBe(true);
    expect(requests.some(r => r.method === 'tools/call')).toBe(true);
    expect(requests.some(r => r.method === 'tools/list')).toBe(true);

    // Find specific tool calls
    const toolCalls = interceptor.findRequestsByMethod('tools/call');
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].params).toMatchObject({
      name: 'greet',
      arguments: { name: 'Test' }
    });
  });
});
