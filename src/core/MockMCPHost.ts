import { TransportInterceptor } from './TransportInterceptor';
import { MockMCPHostConfig, MCPCapabilities, JSONRPCRequest, JSONRPCResponse } from '../types';

/**
 * MockMCPHost - Simulates an IDE environment hosting an MCP server
 * 
 * This class provides:
 * - A simulated MCP host environment for testing
 * - Automatic handling of common MCP protocol messages
 * - Integration with TransportInterceptor for request/response mocking
 * - Capability simulation (tools, resources, prompts)
 */
export class MockMCPHost {
  private interceptor: TransportInterceptor;
  private config: MockMCPHostConfig;
  private capabilities: MCPCapabilities;
  private initialized = false;
  private requestIdCounter = 0;

  constructor(config: MockMCPHostConfig = {}) {
    this.config = {
      autoRespond: true,
      debug: false,
      ...config,
    };

    this.interceptor = new TransportInterceptor(this.config.debug);
    this.capabilities = {};

    if (this.config.autoRespond) {
      this.setupAutoResponders();
    }
  }

  /**
   * Get the transport interceptor
   */
  getInterceptor(): TransportInterceptor {
    return this.interceptor;
  }

  /**
   * Set up automatic responses for common MCP protocol messages
   */
  private setupAutoResponders(): void {
    // Auto-respond to initialize requests
    this.interceptor.mockResponse('initialize', (request: JSONRPCRequest) => {
      this.initialized = true;
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: this.capabilities,
          serverInfo: {
            name: 'mock-mcp-server',
            version: '0.1.0',
          },
        },
      };
    });

    // Auto-respond to ping requests
    this.interceptor.mockResponse('ping', (request: JSONRPCRequest) => ({
      jsonrpc: '2.0',
      id: request.id,
      result: {},
    }));

    // Auto-respond to tools/list requests
    this.interceptor.mockResponse('tools/list', (request: JSONRPCRequest) => ({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        tools: [],
      },
    }));

    // Auto-respond to resources/list requests
    this.interceptor.mockResponse('resources/list', (request: JSONRPCRequest) => ({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        resources: [],
      },
    }));

    // Auto-respond to prompts/list requests
    this.interceptor.mockResponse('prompts/list', (request: JSONRPCRequest) => ({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        prompts: [],
      },
    }));
  }

  /**
   * Set capabilities that this host supports
   */
  setCapabilities(capabilities: MCPCapabilities): void {
    this.capabilities = capabilities;
  }

  /**
   * Send a request to the server (simulate client -> server)
   */
  async sendRequest(method: string, params?: unknown): Promise<JSONRPCResponse> {
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: ++this.requestIdCounter,
      method,
      params,
    };

    // Intercept the request
    const interceptedRequest = await this.interceptor.interceptRequest(request);

    // Check if we should mock the response
    const mockResponse = await this.interceptor.shouldMock(interceptedRequest);
    if (mockResponse) {
      return await this.interceptor.interceptResponse(mockResponse);
    }

    // If no mock, return an error
    const errorResponse: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: interceptedRequest.id,
      error: {
        code: -32601,
        message: `Method not found: ${method}`,
      },
    };

    return await this.interceptor.interceptResponse(errorResponse);
  }

  /**
   * Initialize the MCP connection
   */
  async initialize(clientInfo?: { name: string; version: string }): Promise<JSONRPCResponse> {
    return await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: clientInfo || {
        name: 'mock-client',
        version: '0.1.0',
      },
    });
  }

  /**
   * Check if the host is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Cleanup and reset the host
   */
  async cleanup(): Promise<void> {
    this.interceptor.reset();
    this.initialized = false;
    this.requestIdCounter = 0;
  }

  /**
   * Get all recorded messages from the interceptor
   */
  getRecordedMessages() {
    return this.interceptor.getRecordedMessages();
  }

  /**
   * Clear recorded messages
   */
  clearRecordedMessages(): void {
    this.interceptor.clearRecordedMessages();
  }
}
