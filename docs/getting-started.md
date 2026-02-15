# Getting Started with MCP Apps Testing

## Overview

The MCP Apps Testing Framework provides a comprehensive solution for testing Model Context Protocol (MCP) applications. It bridges the gap between MCP protocol testing and UI rendering/iframe sandboxing.

## Installation

```bash
npm install
npx playwright install chromium
```

## Quick Start

### 1. Zero-Config Setup

```typescript
import { test, expect } from '@playwright/test';
import { MockMCPHost } from 'mcp-apps-testing';

test.describe('My MCP App Tests', () => {
  let host: MockMCPHost;

  test.beforeEach(async () => {
    // Zero-config setup with Claude profile
    host = new MockMCPHost({ 
      hostProfile: 'Claude',
      debug: true 
    });
  });

  test.afterEach(async () => {
    await host.cleanup();
  });

  test('should initialize MCP connection', async () => {
    const response = await host.initialize({
      name: 'my-app',
      version: '1.0.0',
    });
    
    expect(response.result).toBeDefined();
    expect(host.isInitialized()).toBe(true);
  });
});
```

### 2. Using Fluent DSL

```typescript
test('should call tool with auto-retry', async () => {
  await host.initialize();
  
  // Mock tool response
  host.getInterceptor().mockResponse('tools/call', (req) => ({
    jsonrpc: '2.0',
    id: req.id,
    result: {
      content: [{ type: 'text', text: 'Success!' }]
    }
  }));
  
  // Use fluent DSL with automatic retries
  const response = await host.callTool('my-tool', { arg: 'value' }, {
    timeout: 5000,
    retries: 3
  });
  
  expect(response.result.content[0].text).toBe('Success!');
});
```

### 3. Mocking Tool Responses

```typescript
test('should mock tool call', async () => {
  const interceptor = host.getInterceptor();
  
  // Mock a tool response
  interceptor.mockResponse('tools/call', (request) => ({
    jsonrpc: '2.0',
    id: request.id,
    result: {
      content: [{ type: 'text', text: 'Mocked result' }],
    },
  }));

  // Call the tool
  const response = await host.sendRequest('tools/call', {
    name: 'my_tool',
    arguments: {},
  });

  expect(response.result.content[0].text).toBe('Mocked result');
});
```

### 4. Testing with Host Profiles

```typescript
test('should test with Claude profile', async () => {
  const host = new MockMCPHost({ hostProfile: 'Claude' });
  
  const profile = host.getHostProfile();
  expect(profile.name).toBe('Claude');
  expect(profile.capabilities.tools.listChanged).toBe(true);
  
  await host.cleanup();
});

test('should test with VS Code profile', async () => {
  const host = new MockMCPHost({ hostProfile: 'VSCode' });
  
  const profile = host.getHostProfile();
  expect(profile.name).toBe('VS Code');
  expect(profile.constraints.maxViewportWidth).toBe(1600);
  
  await host.cleanup();
});
```

### 5. Testing UI with Themes

```typescript
import { HostProfiles, applyTheme } from 'mcp-apps-testing';

test('should render with Claude dark theme', async ({ page }) => {
  await page.goto('file:///path/to/app.html');
  
  // Apply Claude dark theme
  const themeCSS = applyTheme(HostProfiles.Claude, 'dark');
  await page.addStyleTag({ content: `:root { ${themeCSS} }` });
  
  // Verify UI elements
  await expect(page.locator('h1')).toBeVisible();
});
```

### 6. Protocol Logging

```typescript
test('should debug with protocol logging', async () => {
  const host = new MockMCPHost();
  
  // Enable detailed logging
  host.enableProtocolLogging();
  
  await host.initialize();
  // Console will show:
  // [MCP Request] { "jsonrpc": "2.0", "method": "initialize", ... }
  // [MCP Response] { "jsonrpc": "2.0", "result": { ... } }
  
  await host.cleanup();
});
```

### 7. Intercepting Messages

```typescript
test('should intercept and record messages', async () => {
  const interceptor = host.getInterceptor();
  
  // Add request interceptor
  interceptor.onRequest(async (request) => {
    console.log('Request:', request.method);
    return request;
  });

  // Send requests
  await host.initialize();
  await host.sendRequest('tools/list');

  // Get recorded messages
  const requests = interceptor.getRecordedRequests();
  expect(requests).toHaveLength(2);
});
```

## Core Concepts

### MockMCPHost

The `MockMCPHost` class simulates an IDE environment hosting an MCP server. It provides:

- Automatic handling of common MCP protocol messages (initialize, ping, tools/list, etc.)
- Request/response simulation
- Capability configuration
- Message recording

### TransportInterceptor

The `TransportInterceptor` class allows you to:

- Intercept and modify outgoing requests
- Intercept and modify incoming responses
- Mock responses for specific methods
- Record all messages for assertions

## Configuration

### MockMCPHost Options

```typescript
const host = new MockMCPHost({
  autoRespond: true,  // Automatically respond to common MCP messages
  debug: true,        // Enable verbose logging
});
```

### Setting Capabilities

```typescript
host.setCapabilities({
  tools: { listChanged: true },
  resources: { subscribe: true, listChanged: true },
  prompts: { listChanged: true },
});
```

## Running Tests

```bash
# Run all tests
npm test

# Run with UI mode
npm run test:ui

# Build the framework
npm run build
```

## Examples

See the `/examples` directory for complete test examples demonstrating various features of the framework.

## Next Steps

- Explore the example tests in `/examples/basic-test.spec.ts`
- Read the API documentation
- Integrate with your UI testing workflow
