import { test, expect } from '@playwright/test';
import {
  MockMCPHost,
  TransportInterceptor,
  expectRequest,
  expectNoRequest,
  expectToolCall,
  expectNoErrors,
  expectMessageSequence,
  expectCapability,
  expectNoCapability,
} from '../src';

/**
 * Layer 1 — Unit Testing with SDK Mocks
 *
 * These tests demonstrate fast, in-process protocol testing using
 * MockMCPHost + assertion helpers. No browser is launched.
 */

test.describe('Layer 1: Unit testing with assertion helpers', () => {
  let host: MockMCPHost;
  let interceptor: TransportInterceptor;

  test.beforeEach(() => {
    host = new MockMCPHost({ autoRespond: true });
    interceptor = host.getInterceptor();
  });

  test.afterEach(async () => {
    await host.cleanup();
  });

  test('expectRequest — asserts a request was made', async () => {
    await host.initialize();
    await host.sendRequest('tools/list');

    // Passes: these methods were called
    expectRequest(interceptor, 'initialize');
    expectRequest(interceptor, 'tools/list');

    // Fails: this method was never called
    expect(() => expectRequest(interceptor, 'unknown/method')).toThrow(
      /Expected a request with method "unknown\/method"/
    );
  });

  test('expectRequest — partial params matching', async () => {
    await host.sendRequest('tools/call', { name: 'greet', arguments: { name: 'Alice' } });

    // Match by tool name only
    expectRequest(interceptor, 'tools/call', { name: 'greet' });

    // Match including nested args
    expectRequest(interceptor, 'tools/call', { name: 'greet', arguments: { name: 'Alice' } });

    // Fails: wrong tool name
    expect(() =>
      expectRequest(interceptor, 'tools/call', { name: 'farewell' })
    ).toThrow(/none matched params/);
  });

  test('expectNoRequest — asserts a method was NOT called', async () => {
    await host.initialize();

    expectNoRequest(interceptor, 'tools/call');

    expect(() => expectNoRequest(interceptor, 'initialize')).toThrow(
      /Expected no requests with method "initialize" but found 1/
    );
  });

  test('expectToolCall — sugar for tools/call assertions', async () => {
    interceptor.mockResponse('tools/call', (req) => ({
      jsonrpc: '2.0',
      id: req.id,
      result: { content: [{ type: 'text', text: 'ok' }] },
    }));

    await host.callTool('greet', { name: 'Bob' });
    await host.callTool('summarize', { text: 'hello world' });

    // Assert specific tool calls
    expectToolCall(interceptor, 'greet');
    expectToolCall(interceptor, 'greet', { name: 'Bob' });
    expectToolCall(interceptor, 'summarize', { text: 'hello world' });

    // Fails: tool not called
    expect(() => expectToolCall(interceptor, 'delete_all')).toThrow(
      /Expected a tools\/call for "delete_all"/
    );
  });

  test('expectNoErrors — asserts no error responses', async () => {
    await host.initialize();
    await host.sendRequest('tools/list');

    // All auto-responders return success
    expectNoErrors(interceptor);
  });

  test('expectNoErrors — catches error responses', async () => {
    // Send a request with no mock — triggers a "method not found" error
    await host.sendRequest('nonexistent/method');

    expect(() => expectNoErrors(interceptor)).toThrow(
      /Expected no error responses but found 1/
    );
  });

  test('expectMessageSequence — verifies method ordering', async () => {
    await host.initialize();
    await host.sendRequest('tools/list');
    await host.sendRequest('resources/list');

    // This order was observed
    expectMessageSequence(interceptor, ['initialize', 'tools/list', 'resources/list']);

    // Subsequences work too
    expectMessageSequence(interceptor, ['initialize', 'resources/list']);

    // Wrong order fails
    expect(() =>
      expectMessageSequence(interceptor, ['resources/list', 'initialize'])
    ).toThrow(/Expected method "initialize" after position/);
  });

  test('expectCapability — asserts capabilities in initialize response', async () => {
    host.setCapabilities({
      tools: { listChanged: true },
      resources: { subscribe: false, listChanged: true },
    });

    const response = await host.initialize();

    expectCapability(response, 'tools.listChanged', true);
    expectCapability(response, 'resources.subscribe', false);
    expectCapability(response, 'resources.listChanged', true);

    // Value mismatch fails
    expect(() => expectCapability(response, 'tools.listChanged', false)).toThrow(
      /Expected capability "tools.listChanged" to be false but got true/
    );
  });

  test('expectNoCapability — asserts capability is absent', async () => {
    host.setCapabilities({
      tools: { listChanged: true },
    });

    const response = await host.initialize();

    // prompts was not set
    expectNoCapability(response, 'prompts.listChanged');

    // tools.listChanged IS present — should fail
    expect(() => expectNoCapability(response, 'tools.listChanged')).toThrow(
      /Expected capability "tools.listChanged" to be absent/
    );
  });

  test('full protocol flow with assertions', async () => {
    // Configure capabilities
    host.setCapabilities({
      tools: { listChanged: true },
      resources: { subscribe: true, listChanged: true },
    });

    // Set up mocks
    interceptor.mockResponse('tools/call', (req) => ({
      jsonrpc: '2.0',
      id: req.id,
      result: { content: [{ type: 'text', text: 'result' }] },
    }));

    // Execute protocol flow
    const initResponse = await host.initialize({ name: 'my-app', version: '1.0' });
    await host.listTools();
    await host.callTool('process', { input: 'data' });

    // Assert the whole flow
    expectCapability(initResponse, 'tools.listChanged', true);
    expectMessageSequence(interceptor, ['initialize', 'tools/list', 'tools/call']);
    expectToolCall(interceptor, 'process', { input: 'data' });
    expectNoErrors(interceptor);
    expectNoRequest(interceptor, 'resources/read');
  });
});
