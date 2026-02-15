/**
 * MCP Apps Testing Framework
 * 
 * A professional framework for testing Model Context Protocol (MCP) UI applications
 * with Playwright. Bridge the gap between MCP protocol testing and UI rendering/iframe sandboxing.
 */

// Export core classes
export { MockMCPHost } from './core/MockMCPHost';
export { TransportInterceptor } from './core/TransportInterceptor';
export { HostProfiles, ClaudeProfile, VSCodeProfile, GenericProfile, applyTheme } from './core/HostProfiles';
export type { HostProfile } from './core/HostProfiles';

// Export protocol validation
export { 
  ProtocolValidator,
  validateRequest,
  validateResponse,
  validateInitializeRequest,
  validateInitializeResponse,
  SUPPORTED_PROTOCOL_VERSIONS,
  LATEST_PROTOCOL_VERSION
} from './core/ProtocolValidator';
export type { ValidationResult, ProtocolVersion } from './core/ProtocolValidator';

// Export session recording and replay
export { SessionRecorder, loadSession, loadSessionFromFile } from './core/SessionRecorder';
export type { SessionMetadata, SessionMessage, RecordedSession } from './core/SessionRecorder';
export { SessionPlayer } from './core/SessionPlayer';
export type { PlaybackOptions, PlaybackResult } from './core/SessionPlayer';

// Export types
export type {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification,
  JSONRPCError,
  MessageHandler,
  RequestInterceptor,
  ResponseInterceptor,
  MockMCPHostConfig,
  MCPCapabilities,
  MCPTestContext,
  MCPTransport,
} from './types';

import type { MockMCPHostConfig, MCPTestContext } from './types';

/**
 * Create a test context with a mock MCP host
 */
export async function createMCPTestContext(config?: MockMCPHostConfig): Promise<MCPTestContext> {
  const { MockMCPHost } = await import('./core/MockMCPHost');
  const host = new MockMCPHost(config);
  const interceptor = host.getInterceptor();

  return {
    host,
    interceptor,
    cleanup: async () => {
      await host.cleanup();
    },
  };
}
