# API Reference

## MockMCPHost

### Constructor

```typescript
constructor(config?: MockMCPHostConfig)
```

Creates a new MockMCPHost instance.

**Parameters:**
- `config.autoRespond` (boolean): Automatically respond to common MCP messages. Default: `true`
- `config.debug` (boolean): Enable verbose logging. Default: `false`
- `config.transport` (MCPTransport): Custom transport implementation

### Methods

#### `getInterceptor(): TransportInterceptor`

Returns the TransportInterceptor instance for this host.

#### `setCapabilities(capabilities: MCPCapabilities): void`

Sets the capabilities that this host advertises.

**Example:**
```typescript
host.setCapabilities({
  tools: { listChanged: true },
  resources: { subscribe: true },
});
```

#### `sendRequest(method: string, params?: unknown): Promise<JSONRPCResponse>`

Sends a JSON-RPC request to the server.

**Parameters:**
- `method`: The JSON-RPC method name
- `params`: Optional parameters for the request

**Returns:** A promise that resolves to the JSON-RPC response

#### `initialize(clientInfo?: { name: string; version: string }): Promise<JSONRPCResponse>`

Initializes the MCP connection.

**Parameters:**
- `clientInfo`: Optional client information

**Returns:** A promise that resolves to the initialize response

#### `isInitialized(): boolean`

Returns whether the host has been initialized.

#### `cleanup(): Promise<void>`

Cleans up and resets the host state.

#### `getRecordedMessages(): Array<JSONRPCRequest | JSONRPCResponse | JSONRPCNotification>`

Returns all recorded messages.

#### `clearRecordedMessages(): void`

Clears all recorded messages.

---

## TransportInterceptor

### Constructor

```typescript
constructor(debug?: boolean)
```

Creates a new TransportInterceptor instance.

**Parameters:**
- `debug`: Enable debug logging. Default: `false`

### Methods

#### `onRequest(interceptor: RequestInterceptor): void`

Adds a request interceptor that can modify outgoing requests.

**Example:**
```typescript
interceptor.onRequest(async (request) => {
  console.log('Sending:', request.method);
  return request;
});
```

#### `onResponse(interceptor: ResponseInterceptor): void`

Adds a response interceptor that can modify incoming responses.

**Example:**
```typescript
interceptor.onResponse(async (response) => {
  console.log('Received:', response);
  return response;
});
```

#### `onMessage(handler: MessageHandler): void`

Adds a message handler that is called for all messages (requests and responses).

#### `mockResponse(method: string, handler: Function): void`

Mocks responses for a specific method.

**Parameters:**
- `method`: The method name to mock
- `handler`: A function that receives the request and returns the mocked response

**Example:**
```typescript
interceptor.mockResponse('tools/call', (request) => ({
  jsonrpc: '2.0',
  id: request.id,
  result: { content: [{ type: 'text', text: 'Mocked' }] },
}));
```

#### `getRecordedMessages(): Array<JSONRPCRequest | JSONRPCResponse | JSONRPCNotification>`

Returns all recorded messages.

#### `getRecordedRequests(): JSONRPCRequest[]`

Returns only recorded requests.

#### `getRecordedResponses(): JSONRPCResponse[]`

Returns only recorded responses.

#### `findRequestsByMethod(method: string): JSONRPCRequest[]`

Finds all recorded requests for a specific method.

**Example:**
```typescript
const pingRequests = interceptor.findRequestsByMethod('ping');
```

#### `clearRecordedMessages(): void`

Clears all recorded messages.

#### `reset(): void`

Clears all interceptors, mocks, and recorded messages.

---

## Types

### JSONRPCRequest

```typescript
interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}
```

### JSONRPCResponse

```typescript
interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: JSONRPCError;
}
```

### JSONRPCError

```typescript
interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}
```

### MCPCapabilities

```typescript
interface MCPCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
}
```

### MockMCPHostConfig

```typescript
interface MockMCPHostConfig {
  autoRespond?: boolean;
  transport?: MCPTransport;
  debug?: boolean;
}
```

---

## VSCodeHost

Real VS Code E2E testing via Playwright's Electron support.

### Static Methods

#### `VSCodeHost.launch(options?: VSCodeHostOptions): Promise<VSCodeHost>`

Launches VS Code and returns a handle for interacting with it.

**Parameters:**
- `options.vscodeExecutablePath` (string): Path to VS Code binary. Auto-detected if omitted.
- `options.vscodeVersion` (string): Version for auto-download. Default: `'stable'`
- `options.extensionDevelopmentPath` (string): Extension source directory to load
- `options.extensionPaths` (string[]): VSIX files to install before launch
- `options.userDataDir` (string): Isolated user data directory. Temp dir if omitted.
- `options.extensionsDir` (string): Isolated extensions directory. Temp dir if omitted.
- `options.workspacePath` (string): Workspace folder or file to open
- `options.debug` (boolean): Log VS Code console output. Default: `false`
- `options.launchTimeout` (number): Launch timeout in ms. Default: `30000`
- `options.extraArgs` (string[]): Additional VS Code CLI arguments

**Example:**
```typescript
const host = await VSCodeHost.launch({
  extensionDevelopmentPath: path.resolve(__dirname, '../my-extension'),
  workspacePath: path.resolve(__dirname, '../test-workspace'),
});
```

#### `VSCodeHost.resolveVSCodePath(version?: string): Promise<string>`

Resolves the VS Code executable path. Checks `VSCODE_PATH` env var, well-known paths, PATH lookup, and `@vscode/test-electron` download.

### Instance Methods

#### `getWindow(): Page`

Returns the Playwright Page for the VS Code window.

#### `getElectronApp(): ElectronApplication`

Returns the underlying Playwright ElectronApplication.

#### `runCommand(command: string): Promise<void>`

Opens the command palette and executes a command by ID or label.

**Example:**
```typescript
await host.runCommand('View: Toggle Terminal');
await host.runCommand('myExtension.openMCPApp');
```

#### `getWebviewFrame(options?: WebviewLocatorOptions): Promise<FrameLocator>`

Returns the content FrameLocator for a webview. Navigates VS Code's nested iframe structure automatically.

**Parameters:**
- `options.tabTitle` (string): Editor tab title to activate first
- `options.timeout` (number): Timeout in ms. Default: `10000`

**Example:**
```typescript
const frame = await host.getWebviewFrame({ tabTitle: 'My MCP App' });
await expect(frame.locator('h1')).toContainText('Hello');
```

#### `waitForWebview(options?: WebviewLocatorOptions): Promise<FrameLocator>`

Waits for a webview to appear, then returns its content FrameLocator.

**Parameters:**
- `options.tabTitle` (string): Editor tab title to activate
- `options.timeout` (number): Timeout in ms. Default: `15000`

#### `screenshot(filePath?: string): Promise<Buffer>`

Captures a screenshot of the VS Code window.

#### `cleanup(): Promise<void>`

Closes VS Code and deletes temporary directories.

### Types

#### VSCodeHostOptions

```typescript
interface VSCodeHostOptions {
  vscodeExecutablePath?: string;
  vscodeVersion?: string;
  extensionDevelopmentPath?: string;
  extensionPaths?: string[];
  userDataDir?: string;
  extensionsDir?: string;
  workspacePath?: string;
  debug?: boolean;
  launchTimeout?: number;
  extraArgs?: string[];
}
```

#### WebviewLocatorOptions

```typescript
interface WebviewLocatorOptions {
  tabTitle?: string;
  timeout?: number;
}
```

---

## Utility Functions

### `createMCPTestContext(config?: MockMCPHostConfig): Promise<MCPTestContext>`

Creates a test context with a mock MCP host and interceptor.

**Returns:** An object containing:
- `host`: MockMCPHost instance
- `interceptor`: TransportInterceptor instance
- `cleanup`: Async cleanup function

**Example:**
```typescript
const { host, interceptor, cleanup } = await createMCPTestContext({ debug: true });
// ... run tests
await cleanup();
```
