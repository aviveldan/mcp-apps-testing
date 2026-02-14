## mcp-apps-testing v0.1.0 - Initial Release

**The first UI testing framework built specifically for Model Context Protocol applications.**

Test your MCP apps exactly how users experience them - with real browser rendering, simulated IDE environments, and complete JSON-RPC message control.

### Highlights

- **MockMCPHost** - Simulates IDE hosting environments (Claude, VS Code) with auto-response to common protocol messages
- **TransportInterceptor** - Mock, record, and assert on every JSON-RPC request and response
- **Host Profiles** - Pre-configured environments (`Claude`, `VSCode`, `Generic`) with distinct capabilities and themes
- **Fluent API** - Human-readable test code with `createMCPTestContext()` for quick setup
- **UI + Protocol Testing** - Validate both visual rendering and protocol interactions in a single framework

### Installation

```bash
npm install mcp-apps-testing @playwright/test --save-dev
npx playwright install chromium
```

### Quick Example

```typescript
import { test, expect } from '@playwright/test';
import { MockMCPHost } from 'mcp-apps-testing';

test('MCP app responds to tool calls', async () => {
  const host = new MockMCPHost({ hostProfile: 'Claude' });

  host.getInterceptor().mockResponse('tools/call', (req) => ({
    jsonrpc: '2.0',
    id: req.id,
    result: { content: [{ type: 'text', text: 'Hello, World!' }] }
  }));

  const response = await host.callTool('greet', { name: 'World' });
  expect(response.result.content[0].text).toBe('Hello, World!');

  await host.cleanup();
});
```

### Exported API

| Export | Type | Description |
|---|---|---|
| `MockMCPHost` | Class | Simulates an MCP host environment |
| `TransportInterceptor` | Class | Intercepts and mocks JSON-RPC messages |
| `HostProfiles` | Object | Pre-built host profile configurations |
| `ClaudeProfile` / `VSCodeProfile` / `GenericProfile` | Object | Individual host profiles |
| `applyTheme` | Function | Applies a host profile's theme |
| `createMCPTestContext` | Function | Factory for quick test setup |

### Requirements

- Node.js >= 18.0.0
- `@playwright/test` ^1.40.0 (peer dependency)

### Links

- [Documentation](https://github.com/aviveldan/mcp-apps-testing#readme)
- [Report Issues](https://github.com/aviveldan/mcp-apps-testing/issues)
- [MIT License](https://github.com/aviveldan/mcp-apps-testing/blob/main/LICENSE)

---

> **Note:** This is a pre-1.0 release (`0.1.0`). The API may evolve based on community feedback. Please report any issues or feature requests!