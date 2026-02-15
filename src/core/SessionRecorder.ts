/**
 * SessionRecorder - Records real MCP protocol sessions
 * 
 * This module captures actual protocol flows from real hosts (Claude, VS Code)
 * for later replay in tests, providing evidence-based testing against real
 * host behaviors rather than assumptions.
 */

import { JSONRPCRequest, JSONRPCResponse, JSONRPCNotification } from '../types';
import { ProtocolValidator } from './ProtocolValidator';

export interface SessionMetadata {
  recordedDate: string;
  hostName: string;
  hostVersion?: string;
  protocolVersion: string;
  description?: string;
  source?: string;
}

export interface SessionMessage {
  timestamp: number;
  direction: 'client-to-server' | 'server-to-client';
  message: JSONRPCRequest | JSONRPCResponse | JSONRPCNotification;
}

export interface RecordedSession {
  metadata: SessionMetadata;
  messages: SessionMessage[];
  constraints?: {
    maxViewportWidth?: number;
    maxViewportHeight?: number;
    allowedProtocols?: string[];
  };
  capabilities?: Record<string, unknown>;
}

/**
 * Records MCP protocol sessions for replay testing
 */
export class SessionRecorder {
  private recording = false;
  private startTime = 0;
  private messages: SessionMessage[] = [];
  private metadata: SessionMetadata;
  private validator: ProtocolValidator;

  constructor(metadata: SessionMetadata) {
    this.metadata = metadata;
    this.validator = new ProtocolValidator(false);
  }

  /**
   * Start recording a session
   */
  startRecording(): void {
    if (this.recording) {
      throw new Error('Already recording');
    }
    this.recording = true;
    this.startTime = Date.now();
    this.messages = [];
    this.validator.reset();
  }

  /**
   * Stop recording a session
   */
  stopRecording(): void {
    if (!this.recording) {
      throw new Error('Not currently recording');
    }
    this.recording = false;
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.recording;
  }

  /**
   * Record a message
   */
  recordMessage(
    direction: 'client-to-server' | 'server-to-client',
    message: JSONRPCRequest | JSONRPCResponse | JSONRPCNotification
  ): void {
    if (!this.recording) {
      throw new Error('Not currently recording. Call startRecording() first.');
    }

    // Validate the message
    const validation = this.validator.validateMessage(message);
    if (!validation.valid) {
      console.warn('[SessionRecorder] Invalid message:', validation.errors);
    }

    const sessionMessage: SessionMessage = {
      timestamp: Date.now() - this.startTime,
      direction,
      message,
    };

    this.messages.push(sessionMessage);
  }

  /**
   * Get the recorded session
   */
  getSession(
    constraints?: RecordedSession['constraints'],
    capabilities?: Record<string, unknown>
  ): RecordedSession {
    return {
      metadata: {
        ...this.metadata,
        recordedDate: new Date().toISOString(),
      },
      messages: [...this.messages],
      constraints,
      capabilities,
    };
  }

  /**
   * Export session as JSON string
   */
  exportSession(
    constraints?: RecordedSession['constraints'],
    capabilities?: Record<string, unknown>
  ): string {
    const session = this.getSession(constraints, capabilities);
    return JSON.stringify(session, null, 2);
  }

  /**
   * Save session to file
   */
  saveSession(
    filePath: string,
    constraints?: RecordedSession['constraints'],
    capabilities?: Record<string, unknown>
  ): void {
    const fs = require('fs');
    const session = this.exportSession(constraints, capabilities);
    fs.writeFileSync(filePath, session, 'utf-8');
  }

  /**
   * Reset the recorder
   */
  reset(): void {
    this.recording = false;
    this.startTime = 0;
    this.messages = [];
    this.validator.reset();
  }

  /**
   * Get recorded message count
   */
  getMessageCount(): number {
    return this.messages.length;
  }

  /**
   * Get validation errors from recorded messages
   */
  getValidationErrors(): string[] {
    return this.validator.getErrors();
  }

  /**
   * Get validation warnings from recorded messages
   */
  getValidationWarnings(): string[] {
    return this.validator.getWarnings();
  }
}

/**
 * Load a recorded session from JSON
 */
export function loadSession(jsonString: string): RecordedSession {
  const session = JSON.parse(jsonString) as RecordedSession;
  
  // Validate session structure
  if (!session.metadata || !session.messages) {
    throw new Error('Invalid session format: missing metadata or messages');
  }

  if (!Array.isArray(session.messages)) {
    throw new Error('Invalid session format: messages must be an array');
  }

  return session;
}

/**
 * Load a recorded session from file
 */
export function loadSessionFromFile(filePath: string): RecordedSession {
  const fs = require('fs');
  const jsonString = fs.readFileSync(filePath, 'utf-8');
  return loadSession(jsonString);
}
