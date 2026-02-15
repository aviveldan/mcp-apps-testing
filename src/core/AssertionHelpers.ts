/**
 * Assertion Helpers for MCP Protocol Testing
 *
 * Ergonomic assertion utilities that work on TransportInterceptor and MockMCPHost
 * for fast, in-process unit testing without a browser.
 */

import { TransportInterceptor } from './TransportInterceptor';
import { JSONRPCRequest, JSONRPCResponse } from '../types';

/**
 * Assert that at least one request with the given method was recorded.
 * Optionally assert on params with a partial match.
 */
export function expectRequest(
  interceptor: TransportInterceptor,
  method: string,
  params?: Record<string, unknown>
): JSONRPCRequest {
  const matches = interceptor.findRequestsByMethod(method);
  if (matches.length === 0) {
    const recorded = interceptor.getRecordedRequests().map(r => r.method);
    throw new Error(
      `Expected a request with method "${method}" but none was found. Recorded methods: [${recorded.join(', ')}]`
    );
  }

  if (params !== undefined) {
    const withParams = matches.find(r => deepPartialMatch(r.params, params));
    if (!withParams) {
      throw new Error(
        `Found ${matches.length} request(s) for "${method}" but none matched params ${JSON.stringify(params)}. ` +
        `Actual params: ${matches.map(r => JSON.stringify(r.params)).join(', ')}`
      );
    }
    return withParams;
  }

  return matches[0];
}

/**
 * Assert that NO request with the given method was recorded.
 */
export function expectNoRequest(
  interceptor: TransportInterceptor,
  method: string
): void {
  const matches = interceptor.findRequestsByMethod(method);
  if (matches.length > 0) {
    throw new Error(
      `Expected no requests with method "${method}" but found ${matches.length}`
    );
  }
}

/**
 * Assert that a tools/call request was made for a specific tool name.
 * Optionally assert on tool arguments with a partial match.
 */
export function expectToolCall(
  interceptor: TransportInterceptor,
  toolName: string,
  args?: Record<string, unknown>
): JSONRPCRequest {
  const toolCalls = interceptor.findRequestsByMethod('tools/call');
  const match = toolCalls.find(r => {
    const p = r.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
    if (p?.name !== toolName) return false;
    if (args !== undefined) return deepPartialMatch(p.arguments, args);
    return true;
  });

  if (!match) {
    const names = toolCalls.map(r => (r.params as { name?: string } | undefined)?.name ?? '(unknown)');
    throw new Error(
      `Expected a tools/call for "${toolName}"${args ? ` with args ${JSON.stringify(args)}` : ''} ` +
      `but none matched. Tool calls recorded: [${names.join(', ')}]`
    );
  }

  return match;
}

/**
 * Assert that none of the recorded responses contain an error.
 */
export function expectNoErrors(interceptor: TransportInterceptor): void {
  const responses = interceptor.getRecordedResponses();
  const errors = responses.filter(r => r.error);
  if (errors.length > 0) {
    const details = errors.map(r => `id=${r.id}: ${r.error?.message} (code ${r.error?.code})`);
    throw new Error(
      `Expected no error responses but found ${errors.length}: ${details.join('; ')}`
    );
  }
}

/**
 * Assert that the recorded request methods appear in the given order.
 * Other methods may appear between them.
 */
export function expectMessageSequence(
  interceptor: TransportInterceptor,
  expectedMethods: string[]
): void {
  const requests = interceptor.getRecordedRequests();
  const methods = requests.map(r => r.method);

  let searchFrom = 0;
  for (const expected of expectedMethods) {
    const idx = methods.indexOf(expected, searchFrom);
    if (idx === -1) {
      throw new Error(
        `Expected method "${expected}" after position ${searchFrom} in sequence, ` +
        `but it was not found. Recorded methods: [${methods.join(', ')}]`
      );
    }
    searchFrom = idx + 1;
  }
}

/**
 * Assert that the host (via its initialize response) advertises a specific capability.
 * Path is a dot-separated key like "tools.listChanged" or "resources.subscribe".
 */
export function expectCapability(
  initializeResponse: JSONRPCResponse,
  capabilityPath: string,
  expectedValue?: unknown
): void {
  const result = initializeResponse.result as { capabilities?: Record<string, unknown> } | undefined;
  if (!result?.capabilities) {
    throw new Error('Initialize response does not contain capabilities');
  }

  const parts = capabilityPath.split('.');
  let current: unknown = result.capabilities;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      throw new Error(
        `Capability path "${capabilityPath}" not found — "${part}" is not an object`
      );
    }
    current = (current as Record<string, unknown>)[part];
  }

  if (current === undefined) {
    throw new Error(`Capability "${capabilityPath}" not found in response`);
  }

  if (expectedValue !== undefined && current !== expectedValue) {
    throw new Error(
      `Expected capability "${capabilityPath}" to be ${JSON.stringify(expectedValue)} but got ${JSON.stringify(current)}`
    );
  }
}

/**
 * Assert that the host does NOT advertise a specific capability.
 */
export function expectNoCapability(
  initializeResponse: JSONRPCResponse,
  capabilityPath: string
): void {
  const result = initializeResponse.result as { capabilities?: Record<string, unknown> } | undefined;
  if (!result?.capabilities) return; // no capabilities at all — passes

  const parts = capabilityPath.split('.');
  let current: unknown = result.capabilities;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return;
    current = (current as Record<string, unknown>)[part];
  }

  if (current !== undefined) {
    throw new Error(
      `Expected capability "${capabilityPath}" to be absent but found ${JSON.stringify(current)}`
    );
  }
}

/** Deep partial match: every key in `expected` must exist and match in `actual`. */
function deepPartialMatch(actual: unknown, expected: unknown): boolean {
  if (expected === actual) return true;
  if (expected === null || expected === undefined) return actual === expected;
  if (typeof expected !== 'object' || typeof actual !== 'object') return false;
  if (actual === null) return false;

  for (const key of Object.keys(expected as Record<string, unknown>)) {
    if (
      !deepPartialMatch(
        (actual as Record<string, unknown>)[key],
        (expected as Record<string, unknown>)[key]
      )
    ) {
      return false;
    }
  }
  return true;
}
