/**
 * ProtocolValidator - Validates MCP protocol conformance
 * 
 * This module provides utilities to validate that MCP messages conform
 * to the protocol specification, including proper message structure,
 * required fields, and semantic correctness.
 */

import { JSONRPCRequest, JSONRPCResponse, JSONRPCNotification } from '../types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ProtocolVersion {
  version: string;
  supported: boolean;
}

/**
 * Protocol version constants
 */
export const SUPPORTED_PROTOCOL_VERSIONS = ['2024-11-05'];
export const LATEST_PROTOCOL_VERSION = '2024-11-05';

/**
 * Validates a JSON-RPC request message
 */
export function validateRequest(request: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!request || typeof request !== 'object') {
    errors.push('Request must be an object');
    return { valid: false, errors, warnings };
  }

  const req = request as Record<string, unknown>;

  // Check required fields
  if (req.jsonrpc !== '2.0') {
    errors.push('jsonrpc field must be "2.0"');
  }

  if (!req.method || typeof req.method !== 'string') {
    errors.push('method field is required and must be a string');
  }

  if (!('id' in req)) {
    warnings.push('Request missing id field (should be a notification if intentional)');
  } else if (req.id === null || req.id === undefined) {
    errors.push('id field cannot be null or undefined in a request');
  }

  // Validate params if present
  if ('params' in req && req.params !== undefined && req.params !== null) {
    if (typeof req.params !== 'object') {
      errors.push('params field must be an object or array if present');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates a JSON-RPC response message
 */
export function validateResponse(response: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!response || typeof response !== 'object') {
    errors.push('Response must be an object');
    return { valid: false, errors, warnings };
  }

  const res = response as Record<string, unknown>;

  // Check required fields
  if (res.jsonrpc !== '2.0') {
    errors.push('jsonrpc field must be "2.0"');
  }

  if (!('id' in res)) {
    errors.push('id field is required in a response');
  }

  // Must have either result or error, but not both
  const hasResult = 'result' in res;
  const hasError = 'error' in res;

  if (!hasResult && !hasError) {
    errors.push('Response must have either result or error field');
  }

  if (hasResult && hasError) {
    errors.push('Response cannot have both result and error fields');
  }

  // Validate error structure if present
  if (hasError && res.error) {
    const error = res.error as Record<string, unknown>;
    if (typeof error !== 'object') {
      errors.push('error field must be an object');
    } else {
      if (typeof error.code !== 'number') {
        errors.push('error.code must be a number');
      }
      if (typeof error.message !== 'string') {
        errors.push('error.message must be a string');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates an initialize request according to MCP spec
 */
export function validateInitializeRequest(request: JSONRPCRequest): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // First validate as a general request
  const baseValidation = validateRequest(request);
  errors.push(...baseValidation.errors);
  warnings.push(...baseValidation.warnings);

  if (request.method !== 'initialize') {
    errors.push('Method must be "initialize"');
  }

  if (!request.params || typeof request.params !== 'object') {
    errors.push('initialize request must have params object');
    return { valid: false, errors, warnings };
  }

  const params = request.params as Record<string, unknown>;

  // Check required fields
  if (!params.protocolVersion || typeof params.protocolVersion !== 'string') {
    errors.push('protocolVersion is required and must be a string');
  } else if (!SUPPORTED_PROTOCOL_VERSIONS.includes(params.protocolVersion as string)) {
    warnings.push(`protocolVersion "${params.protocolVersion}" may not be supported`);
  }

  if (!params.capabilities || typeof params.capabilities !== 'object') {
    errors.push('capabilities is required and must be an object');
  }

  if (!params.clientInfo || typeof params.clientInfo !== 'object') {
    errors.push('clientInfo is required and must be an object');
  } else {
    const clientInfo = params.clientInfo as Record<string, unknown>;
    if (!clientInfo.name || typeof clientInfo.name !== 'string') {
      errors.push('clientInfo.name is required and must be a string');
    }
    if (!clientInfo.version || typeof clientInfo.version !== 'string') {
      errors.push('clientInfo.version is required and must be a string');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates an initialize response according to MCP spec
 */
export function validateInitializeResponse(response: JSONRPCResponse): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // First validate as a general response
  const baseValidation = validateResponse(response);
  errors.push(...baseValidation.errors);
  warnings.push(...baseValidation.warnings);

  if (!response.result) {
    // If there's an error, that's acceptable
    if (response.error) {
      return { valid: errors.length === 0, errors, warnings };
    }
    errors.push('initialize response must have a result');
    return { valid: false, errors, warnings };
  }

  const result = response.result as Record<string, unknown>;

  // Check required fields
  if (!result.protocolVersion || typeof result.protocolVersion !== 'string') {
    errors.push('result.protocolVersion is required and must be a string');
  }

  if (!result.capabilities || typeof result.capabilities !== 'object') {
    errors.push('result.capabilities is required and must be an object');
  }

  if (!result.serverInfo || typeof result.serverInfo !== 'object') {
    errors.push('result.serverInfo is required and must be an object');
  } else {
    const serverInfo = result.serverInfo as Record<string, unknown>;
    if (!serverInfo.name || typeof serverInfo.name !== 'string') {
      errors.push('serverInfo.name is required and must be a string');
    }
    if (!serverInfo.version || typeof serverInfo.version !== 'string') {
      errors.push('serverInfo.version is required and must be a string');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Protocol Validator class for comprehensive testing
 */
export class ProtocolValidator {
  private strictMode: boolean;
  private validationErrors: string[] = [];
  private validationWarnings: string[] = [];

  constructor(strictMode = false) {
    this.strictMode = strictMode;
  }

  /**
   * Validate any message (request, response, or notification)
   */
  validateMessage(message: unknown): ValidationResult {
    if (!message || typeof message !== 'object') {
      return {
        valid: false,
        errors: ['Message must be an object'],
        warnings: [],
      };
    }

    const msg = message as Record<string, unknown>;

    // Determine message type and validate accordingly
    if ('method' in msg && 'id' in msg) {
      return this.validateRequest(msg as unknown as JSONRPCRequest);
    } else if ('id' in msg && ('result' in msg || 'error' in msg)) {
      return this.validateResponse(msg as unknown as JSONRPCResponse);
    } else if ('method' in msg && !('id' in msg)) {
      // Notification
      return validateRequest(msg);
    }

    return {
      valid: false,
      errors: ['Unable to determine message type'],
      warnings: [],
    };
  }

  /**
   * Validate a request
   */
  validateRequest(request: JSONRPCRequest): ValidationResult {
    const result = validateRequest(request);
    
    if (!result.valid || (this.strictMode && result.warnings.length > 0)) {
      this.validationErrors.push(...result.errors);
      this.validationWarnings.push(...result.warnings);
    }

    return result;
  }

  /**
   * Validate a response
   */
  validateResponse(response: JSONRPCResponse): ValidationResult {
    const result = validateResponse(response);
    
    if (!result.valid || (this.strictMode && result.warnings.length > 0)) {
      this.validationErrors.push(...result.errors);
      this.validationWarnings.push(...result.warnings);
    }

    return result;
  }

  /**
   * Get all validation errors collected
   */
  getErrors(): string[] {
    return [...this.validationErrors];
  }

  /**
   * Get all validation warnings collected
   */
  getWarnings(): string[] {
    return [...this.validationWarnings];
  }

  /**
   * Reset validation state
   */
  reset(): void {
    this.validationErrors = [];
    this.validationWarnings = [];
  }

  /**
   * Check if validator has any errors
   */
  hasErrors(): boolean {
    return this.validationErrors.length > 0;
  }

  /**
   * Check if validator has any warnings
   */
  hasWarnings(): boolean {
    return this.validationWarnings.length > 0;
  }
}
