import { test, expect } from '@playwright/test';
import {
  SessionRecorder,
  SessionPlayer,
  MockMCPHost,
  loadSession,
} from '../src';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Session Recording and Replay', () => {
  test('should record a session', () => {
    const recorder = new SessionRecorder({
      hostName: 'Test Host',
      protocolVersion: '2024-11-05',
      description: 'Test session',
    });

    recorder.startRecording();
    expect(recorder.isRecording()).toBe(true);

    // Record a request
    recorder.recordMessage('client-to-server', {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {},
    });

    // Record a response
    recorder.recordMessage('server-to-client', {
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        serverInfo: { name: 'test', version: '1.0.0' },
      },
    });

    recorder.stopRecording();
    expect(recorder.isRecording()).toBe(false);

    const session = recorder.getSession();
    expect(session.messages).toHaveLength(2);
    expect(session.metadata.hostName).toBe('Test Host');
  });

  test('should export session as JSON', () => {
    const recorder = new SessionRecorder({
      hostName: 'Test Host',
      protocolVersion: '2024-11-05',
    });

    recorder.startRecording();
    recorder.recordMessage('client-to-server', {
      jsonrpc: '2.0',
      id: 1,
      method: 'ping',
    });
    recorder.stopRecording();

    const json = recorder.exportSession();
    expect(json).toContain('"hostName": "Test Host"');
    expect(json).toContain('"method": "ping"');
  });

  test('should load Claude session from file', () => {
    const sessionPath = path.join(__dirname, '../profiles/sessions/claude-basic-flow.json');
    const jsonString = fs.readFileSync(sessionPath, 'utf-8');
    const session = loadSession(jsonString);

    expect(session.metadata.hostName).toBe('Claude Desktop');
    expect(session.metadata.protocolVersion).toBe('2024-11-05');
    expect(session.messages.length).toBeGreaterThan(0);
  });

  test('should load VS Code session from file', () => {
    const sessionPath = path.join(__dirname, '../profiles/sessions/vscode-basic-flow.json');
    const jsonString = fs.readFileSync(sessionPath, 'utf-8');
    const session = loadSession(jsonString);

    expect(session.metadata.hostName).toBe('VS Code');
    expect(session.metadata.protocolVersion).toBe('2024-11-05');
    expect(session.messages.length).toBeGreaterThan(0);
  });

  test('should create a session player', () => {
    const session = {
      metadata: {
        recordedDate: '2024-01-01T00:00:00.000Z',
        hostName: 'Test',
        protocolVersion: '2024-11-05',
      },
      messages: [],
    };

    const player = new SessionPlayer(session);
    expect(player.getMetadata().hostName).toBe('Test');
    expect(player.getMessages()).toHaveLength(0);
  });

  test('should filter messages by direction', () => {
    const session = {
      metadata: {
        recordedDate: '2024-01-01T00:00:00.000Z',
        hostName: 'Test',
        protocolVersion: '2024-11-05',
      },
      messages: [
        {
          timestamp: 0,
          direction: 'client-to-server' as const,
          message: { jsonrpc: '2.0', id: 1, method: 'test' },
        },
        {
          timestamp: 10,
          direction: 'server-to-client' as const,
          message: { jsonrpc: '2.0', id: 1, result: {} },
        },
      ],
    };

    const player = new SessionPlayer(session);
    const clientMessages = player.getMessagesByDirection('client-to-server');
    expect(clientMessages).toHaveLength(1);
  });

  test('should filter messages by method', () => {
    const session = {
      metadata: {
        recordedDate: '2024-01-01T00:00:00.000Z',
        hostName: 'Test',
        protocolVersion: '2024-11-05',
      },
      messages: [
        {
          timestamp: 0,
          direction: 'client-to-server' as const,
          message: { jsonrpc: '2.0', id: 1, method: 'initialize' },
        },
        {
          timestamp: 10,
          direction: 'client-to-server' as const,
          message: { jsonrpc: '2.0', id: 2, method: 'ping' },
        },
      ],
    };

    const player = new SessionPlayer(session);
    const initMessages = player.getMessagesByMethod('initialize');
    expect(initMessages).toHaveLength(1);
    expect((initMessages[0].message as any).method).toBe('initialize');
  });

  test('should replay session with MockMCPHost', async () => {
    const session = {
      metadata: {
        recordedDate: '2024-01-01T00:00:00.000Z',
        hostName: 'Test',
        protocolVersion: '2024-11-05',
      },
      messages: [
        {
          timestamp: 0,
          direction: 'client-to-server' as const,
          message: {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2024-11-05',
              capabilities: {},
              clientInfo: { name: 'test', version: '1.0.0' },
            },
          },
        },
      ],
    };

    const host = new MockMCPHost({ autoRespond: true });
    const player = new SessionPlayer(session);

    const result = await player.replay(host, { speed: 0, validate: true });
    expect(result.messagesPlayed).toBe(1);
    expect(result.success).toBe(true);

    await host.cleanup();
  });

  test('should compare two sessions', () => {
    const session1 = {
      metadata: {
        recordedDate: '2024-01-01T00:00:00.000Z',
        hostName: 'Test',
        protocolVersion: '2024-11-05',
      },
      messages: [
        {
          timestamp: 0,
          direction: 'client-to-server' as const,
          message: { jsonrpc: '2.0', id: 1, method: 'ping' },
        },
      ],
    };

    const session2 = {
      metadata: {
        recordedDate: '2024-01-01T00:00:00.000Z',
        hostName: 'Test',
        protocolVersion: '2024-11-05',
      },
      messages: [
        {
          timestamp: 0,
          direction: 'client-to-server' as const,
          message: { jsonrpc: '2.0', id: 1, method: 'ping' },
        },
      ],
    };

    const comparison = SessionPlayer.compareSessions(session1, session2);
    expect(comparison.identical).toBe(true);
    expect(comparison.differences).toHaveLength(0);
  });

  test('should detect differences between sessions', () => {
    const session1 = {
      metadata: {
        recordedDate: '2024-01-01T00:00:00.000Z',
        hostName: 'Test',
        protocolVersion: '2024-11-05',
      },
      messages: [
        {
          timestamp: 0,
          direction: 'client-to-server' as const,
          message: { jsonrpc: '2.0', id: 1, method: 'ping' },
        },
      ],
    };

    const session2 = {
      metadata: {
        recordedDate: '2024-01-01T00:00:00.000Z',
        hostName: 'Test',
        protocolVersion: '2024-11-05',
      },
      messages: [
        {
          timestamp: 0,
          direction: 'client-to-server' as const,
          message: { jsonrpc: '2.0', id: 1, method: 'initialize' },
        },
      ],
    };

    const comparison = SessionPlayer.compareSessions(session1, session2);
    expect(comparison.identical).toBe(false);
    expect(comparison.differences.length).toBeGreaterThan(0);
  });

  test('should extract host profile from session', () => {
    const sessionPath = path.join(__dirname, '../profiles/sessions/claude-basic-flow.json');
    const jsonString = fs.readFileSync(sessionPath, 'utf-8');
    const session = loadSession(jsonString);

    const profile = SessionPlayer.extractHostProfile(session);
    expect(profile.name).toBe('Claude Desktop');
    expect(profile.capabilities).toBeDefined();
  });

  test('should validate session integrity', () => {
    const session = {
      metadata: {
        recordedDate: '2024-01-01T00:00:00.000Z',
        hostName: 'Test',
        protocolVersion: '2024-11-05',
      },
      messages: [
        {
          timestamp: 0,
          direction: 'client-to-server' as const,
          message: { jsonrpc: '2.0', id: 1, method: 'ping' },
        },
      ],
    };

    const player = new SessionPlayer(session);
    const validation = player.validateSession();
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  test('should detect invalid session', () => {
    const session = {
      metadata: {
        recordedDate: '2024-01-01T00:00:00.000Z',
        hostName: '',
        protocolVersion: '',
      },
      messages: [],
    };

    const player = new SessionPlayer(session);
    const validation = player.validateSession();
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });
});
