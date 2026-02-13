# mcp-apps-testing

The professional UI testing framework for Model Context Protocol (MCP) applications. Validate rendering, sandboxing, and JSON-RPC interactions in a simulated host environment.

## 🎯 Overview

**mcp-apps-testing** bridges the gap between MCP protocol testing and UI rendering/iframe sandboxing. It provides a comprehensive framework for testing MCP applications with Playwright, enabling you to:

- ✅ Simulate IDE environments hosting MCP servers
- ✅ Mock and intercept JSON-RPC 2.0 messages
- ✅ Test MCP protocol interactions without a real server
- ✅ Validate UI rendering and sandboxing behavior
- ✅ Record and assert message flows

## 🚀 Quick Start

### Installation

```bash
npm install
```

### Basic Usage

```typescript
import { test, expect } from '@playwright/test';
import { MockMCPHost } from 'mcp-apps-testing';

test('MCP initialization', async () => {
  const host = new MockMCPHost({ debug: true });
  
  const response = await host.initialize({
    name: 'my-app',
    version: '1.0.0',
  });
  
  expect(host.isInitialized()).toBe(true);
  await host.cleanup();
});
```

## 🏗️ Architecture

### Core Components

1. **MockMCPHost** - Simulates an IDE environment hosting an MCP server
   - Handles common MCP protocol messages automatically
   - Supports capability configuration
   - Provides request/response simulation

2. **TransportInterceptor** - Intercepts and mocks JSON-RPC messages
   - Request/response interception and modification
   - Method-specific response mocking
   - Complete message recording for assertions

### Project Structure

```
mcp-apps-testing/
├── src/              # Framework engine
│   ├── core/         # Core classes (MockMCPHost, TransportInterceptor)
│   ├── types/        # TypeScript type definitions
│   └── index.ts      # Main exports
├── examples/         # Sample tests
├── docs/             # Documentation
├── dist/             # Built output (generated)
└── playwright.config.ts
```

## 📚 Key Features

### Automatic Protocol Handling

The framework automatically responds to common MCP protocol messages:
- `initialize` - Connection initialization with capability negotiation
- `ping` - Keep-alive messages
- `tools/list` - List available tools
- `resources/list` - List available resources
- `prompts/list` - List available prompts

### Custom Response Mocking

```typescript
const interceptor = host.getInterceptor();

interceptor.mockResponse('tools/call', (request) => ({
  jsonrpc: '2.0',
  id: request.id,
  result: {
    content: [{ type: 'text', text: 'Mocked tool result' }],
  },
}));
```

### Message Interception

```typescript
// Intercept all outgoing requests
interceptor.onRequest(async (request) => {
  console.log('Request:', request.method);
  return request;  // Can modify before returning
});

// Intercept all incoming responses
interceptor.onResponse(async (response) => {
  console.log('Response:', response);
  return response;  // Can modify before returning
});
```

### Message Recording and Assertions

```typescript
// Send some requests
await host.initialize();
await host.sendRequest('tools/list');

// Get recorded messages
const requests = interceptor.getRecordedRequests();
expect(requests).toHaveLength(2);
expect(requests[0].method).toBe('initialize');

// Find specific messages
const toolRequests = interceptor.findRequestsByMethod('tools/list');
expect(toolRequests).toHaveLength(1);
```

## 🔧 Configuration

### MockMCPHost Options

```typescript
const host = new MockMCPHost({
  autoRespond: true,  // Auto-respond to common protocol messages
  debug: true,        // Enable verbose logging
});
```

### Capability Configuration

```typescript
host.setCapabilities({
  tools: { listChanged: true },
  resources: { subscribe: true, listChanged: true },
  prompts: { listChanged: true },
});
```

## 📖 Documentation

- [Getting Started Guide](docs/getting-started.md)
- [API Reference](docs/api-reference.md)
- [Example Tests](examples/)

## 🧪 Running Tests

```bash
# Run all tests
npm test

# Run with Playwright UI mode
npm run test:ui

# Build the framework
npm run build

# Development mode with watch
npm run dev
```

## 🛠️ Tech Stack

- **TypeScript** - Type-safe framework development
- **Playwright** - UI testing and browser automation
- **@modelcontextprotocol/sdk** - MCP protocol implementation

## 📦 Package Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Watch mode for development
- `npm test` - Run Playwright tests
- `npm run test:ui` - Run tests with Playwright UI
- `npm run clean` - Remove build artifacts

## 🤝 Contributing

This is a professional framework designed for MCP UI application testing. Contributions should maintain the modular, extensible architecture and focus on the core testing capabilities.

## 📄 License

MIT

## 🔗 Related Projects

- [Model Context Protocol](https://modelcontextprotocol.io/) - Official MCP specification
- [Playwright](https://playwright.dev/) - Browser testing framework
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) - MCP TypeScript SDK
