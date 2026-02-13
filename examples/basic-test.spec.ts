import { test, expect } from '@playwright/test';
import { MockMCPHost, TransportInterceptor } from '../src';

/**
 * Example test demonstrating the MCP Apps Testing Framework
 * 
 * This test shows how to:
 * 1. Create a MockMCPHost to simulate an IDE environment
 * 2. Use TransportInterceptor to mock JSON-RPC requests/responses
 * 3. Test MCP protocol interactions
 * 4. Verify message flows
 */

test.describe('MCP Apps Testing Framework - Example', () => {
  let host: MockMCPHost;
  let interceptor: TransportInterceptor;

  test.beforeEach(async () => {
    // Create a mock MCP host with debug enabled
    host = new MockMCPHost({ debug: false });
    interceptor = host.getInterceptor();
  });

  test.afterEach(async () => {
    // Clean up after each test
    await host.cleanup();
  });

  test('should initialize MCP connection', async () => {
    // Send an initialize request
    const response = await host.initialize({
      name: 'test-client',
      version: '1.0.0',
    });

    // Verify the response
    expect(response.jsonrpc).toBe('2.0');
    expect(response.result).toBeDefined();
    expect(response.result).toHaveProperty('protocolVersion');
    expect(response.result).toHaveProperty('capabilities');
    expect(response.result).toHaveProperty('serverInfo');

    // Verify host is initialized
    expect(host.isInitialized()).toBe(true);
  });

  test('should mock custom tool responses', async () => {
    // Mock a custom tool response
    interceptor.mockResponse('tools/call', (request: any) => ({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        content: [
          {
            type: 'text',
            text: 'Mocked tool result',
          },
        ],
      },
    }));

    // Call the tool
    const response = await host.sendRequest('tools/call', {
      name: 'example_tool',
      arguments: { key: 'value' },
    });

    // Verify the mocked response
    expect(response.result).toBeDefined();
    expect(response.result.content[0].text).toBe('Mocked tool result');
  });

  test('should intercept and record messages', async () => {
    // Add a request interceptor to log all requests
    const requests: any[] = [];
    interceptor.onRequest(async (request) => {
      requests.push(request);
      return request;
    });

    // Send some requests
    await host.initialize();
    await host.sendRequest('tools/list');
    await host.sendRequest('resources/list');

    // Verify messages were recorded
    const recordedRequests = interceptor.getRecordedRequests();
    expect(recordedRequests).toHaveLength(3);
    expect(recordedRequests[0].method).toBe('initialize');
    expect(recordedRequests[1].method).toBe('tools/list');
    expect(recordedRequests[2].method).toBe('resources/list');

    // Verify our interceptor was called
    expect(requests).toHaveLength(3);
  });

  test('should handle custom capabilities', async () => {
    // Set custom capabilities
    host.setCapabilities({
      tools: { listChanged: true },
      resources: { subscribe: true, listChanged: true },
      prompts: { listChanged: true },
    });

    // Initialize and check capabilities
    const response = await host.initialize();
    expect(response.result.capabilities).toEqual({
      tools: { listChanged: true },
      resources: { subscribe: true, listChanged: true },
      prompts: { listChanged: true },
    });
  });

  test('should find requests by method', async () => {
    // Send multiple requests
    await host.sendRequest('ping');
    await host.sendRequest('tools/list');
    await host.sendRequest('ping');

    // Find ping requests
    const pingRequests = interceptor.findRequestsByMethod('ping');
    expect(pingRequests).toHaveLength(2);
    expect(pingRequests[0].method).toBe('ping');
    expect(pingRequests[1].method).toBe('ping');
  });

  test('should clear recorded messages', async () => {
    // Send some requests
    await host.initialize();
    await host.sendRequest('ping');

    // Verify messages are recorded
    expect(interceptor.getRecordedMessages().length).toBeGreaterThan(0);

    // Clear messages
    host.clearRecordedMessages();

    // Verify messages are cleared
    expect(interceptor.getRecordedMessages()).toHaveLength(0);
  });

  test('should handle method not found errors', async () => {
    // Send a request for an unmocked method
    const response = await host.sendRequest('unknown/method');

    // Verify error response
    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe(-32601);
    expect(response.error?.message).toContain('Method not found');
  });
});
