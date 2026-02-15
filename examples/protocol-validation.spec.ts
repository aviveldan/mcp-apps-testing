import { test, expect } from '@playwright/test';
import {
  ProtocolValidator,
  validateRequest,
  validateResponse,
  validateInitializeRequest,
  validateInitializeResponse,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '../src';

test.describe('Protocol Validation', () => {
  test('should validate a correct JSON-RPC request', () => {
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { foo: 'bar' },
    };

    const result = validateRequest(request);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should detect invalid JSON-RPC request', () => {
    const request = {
      jsonrpc: '1.0', // Wrong version
      id: 1,
      method: 'test',
    };

    const result = validateRequest(request);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('should validate a correct JSON-RPC response', () => {
    const response = {
      jsonrpc: '2.0',
      id: 1,
      result: { success: true },
    };

    const result = validateResponse(response);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should detect response with both result and error', () => {
    const response = {
      jsonrpc: '2.0',
      id: 1,
      result: {},
      error: { code: -32600, message: 'Invalid' },
    };

    const result = validateResponse(response);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Response cannot have both result and error fields');
  });

  test('should validate initialize request', () => {
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
      },
    };

    const result = validateInitializeRequest(request);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should detect invalid initialize request', () => {
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        // Missing required fields
      },
    };

    const result = validateInitializeRequest(request);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('should validate initialize response', () => {
    const response = {
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
      },
    };

    const result = validateInitializeResponse(response);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should use ProtocolValidator class', () => {
    const validator = new ProtocolValidator();

    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'test',
    };

    const result = validator.validateRequest(request);
    expect(result.valid).toBe(true);
    expect(validator.hasErrors()).toBe(false);
  });

  test('should accumulate errors in validator', () => {
    const validator = new ProtocolValidator();

    // Invalid request
    validator.validateRequest({
      jsonrpc: '1.0',
      id: 1,
      method: 'test',
    });

    expect(validator.hasErrors()).toBe(true);
    expect(validator.getErrors().length).toBeGreaterThan(0);

    validator.reset();
    expect(validator.hasErrors()).toBe(false);
  });

  test('should validate message types automatically', () => {
    const validator = new ProtocolValidator();

    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'test',
    };

    const result = validator.validateMessage(request);
    expect(result.valid).toBe(true);
  });

  test('should detect unsupported protocol versions', () => {
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '9999-99-99',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    };

    const result = validateInitializeRequest(request);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test('should list supported protocol versions', () => {
    expect(SUPPORTED_PROTOCOL_VERSIONS).toContain('2024-11-05');
  });
});
