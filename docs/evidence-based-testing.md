# Evidence-Based Testing Guide

## Overview

The MCP Apps Testing Framework now includes **evidence-based testing** capabilities that allow you to test against real host behaviors captured from actual Claude Desktop and VS Code sessions, rather than relying solely on assumptions.

## Why Evidence-Based Testing?

Traditional mock testing can be misleading because:
- Mock host profiles may not reflect real host constraints
- Assumptions about protocol flows may be incorrect
- Edge cases and error handling might be missed
- Host behavior changes over time

Evidence-based testing addresses these issues by:
- Recording actual protocol sessions from real hosts
- Replaying recorded sessions in tests
- Validating protocol conformance
- Documenting limitations and differences

## Features

### 1. Protocol Validation

Validate that your MCP messages conform to the protocol specification:

```typescript
import { validateRequest, validateResponse, ProtocolValidator } from 'mcp-apps-testing';

// Validate a single request
const result = validateRequest({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { ... }
});

if (!result.valid) {
  console.error('Validation errors:', result.errors);
}

// Use the validator class for batch validation
const validator = new ProtocolValidator();
validator.validateRequest(request1);
validator.validateRequest(request2);

if (validator.hasErrors()) {
  console.error('Errors found:', validator.getErrors());
}
```

### 2. Session Recording

Capture real protocol flows from Claude or VS Code:

```typescript
import { SessionRecorder } from 'mcp-apps-testing';

const recorder = new SessionRecorder({
  hostName: 'Claude Desktop',
  hostVersion: '1.0.0',
  protocolVersion: '2024-11-05',
  description: 'Basic tool call flow',
  source: 'Manual testing with Claude Desktop'
});

recorder.startRecording();

// Record messages as they occur
recorder.recordMessage('client-to-server', {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { ... }
});

recorder.recordMessage('server-to-client', {
  jsonrpc: '2.0',
  id: 1,
  result: { ... }
});

recorder.stopRecording();

// Save the session
recorder.saveSession('./sessions/my-session.json', constraints, capabilities);
```

### 3. Session Replay

Replay recorded sessions in your tests:

```typescript
import { SessionPlayer, loadSession, MockMCPHost } from 'mcp-apps-testing';
import * as fs from 'fs';

test('should match Claude Desktop behavior', async () => {
  // Load a recorded session
  const sessionJson = fs.readFileSync('./profiles/sessions/claude-basic-flow.json', 'utf-8');
  const session = loadSession(sessionJson);

  // Create a player
  const player = new SessionPlayer(session);

  // Replay with a mock host
  const host = new MockMCPHost({ autoRespond: true });
  const result = await player.replay(host, {
    speed: 0,      // Instant playback
    validate: true, // Validate messages
  });

  expect(result.success).toBe(true);
  expect(result.messagesPlayed).toBe(session.messages.length);
  
  await host.cleanup();
});
```

### 4. Versioned Host Profiles

Use evidence-based host profiles loaded from JSON:

```typescript
import { loadHostProfileByName } from 'mcp-apps-testing';

// Load a specific version of Claude's profile
const claudeProfile = loadHostProfileByName('claude', '1.0.0');

console.log('Capabilities:', claudeProfile.capabilities);
console.log('Limitations:', claudeProfile.limitations);
console.log('Recorded from:', claudeProfile.source);
```

## Recording Real Sessions

### From Claude Desktop

1. **Enable Developer Tools** in Claude Desktop
2. **Monitor Network Traffic** or use the MCP Inspector
3. **Capture Protocol Messages** during your interaction
4. **Save to JSON** using the SessionRecorder API

### From VS Code

1. **Install the MCP Extension** for VS Code
2. **Enable Extension Debugging**
3. **Capture Messages** from the extension host
4. **Record Using SessionRecorder**

### Session File Format

```json
{
  "metadata": {
    "recordedDate": "2024-01-15T10:30:00.000Z",
    "hostName": "Claude Desktop",
    "hostVersion": "1.0.0",
    "protocolVersion": "2024-11-05",
    "description": "Basic initialization and tool call",
    "source": "Recorded from Claude Desktop during manual testing"
  },
  "capabilities": {
    "tools": { "listChanged": true },
    "resources": { "subscribe": true, "listChanged": true }
  },
  "constraints": {
    "maxViewportWidth": 1920,
    "maxViewportHeight": 1080,
    "allowedProtocols": ["http", "https", "data"]
  },
  "messages": [
    {
      "timestamp": 0,
      "direction": "client-to-server",
      "message": { ... }
    }
  ]
}
```

## Comparing Sessions

Compare two sessions to detect behavioral changes:

```typescript
import { SessionPlayer, loadSession } from 'mcp-apps-testing';

const session1 = loadSession(oldSessionJson);
const session2 = loadSession(newSessionJson);

const comparison = SessionPlayer.compareSessions(session1, session2);

if (!comparison.identical) {
  console.log('Differences detected:');
  comparison.differences.forEach(diff => console.log(`- ${diff}`));
}
```

## Host Profile Validation

Validate and compare host profiles:

```typescript
import { validateHostProfile, compareHostProfiles } from 'mcp-apps-testing';

const profile = loadHostProfileByName('claude', '1.0.0');

// Validate the profile
const validation = validateHostProfile(profile);
if (!validation.valid) {
  console.error('Profile errors:', validation.errors);
}
if (validation.warnings.length > 0) {
  console.warn('Profile warnings:', validation.warnings);
}

// Compare two versions
const oldProfile = loadHostProfileByName('claude', '1.0.0');
const newProfile = loadHostProfileByName('claude', '2.0.0');
const comparison = compareHostProfiles(oldProfile, newProfile);
```

## Best Practices

### 1. Version Your Profiles
- Keep multiple versions of host profiles
- Document when and how each was recorded
- Track changes between versions

### 2. Document Limitations
- Always include `limitations` in your profiles
- Note what aspects are not covered
- Indicate confidence levels

### 3. Regular Updates
- Re-record sessions periodically
- Test against new host versions
- Update profiles when hosts change

### 4. Combine Approaches
- Use recorded sessions for critical flows
- Use mocks for edge cases not yet captured
- Validate all messages for protocol conformance

### 5. Test Against Multiple Hosts
```typescript
const hosts = ['claude', 'vscode'];
for (const hostName of hosts) {
  test(`should work with ${hostName}`, async () => {
    const profile = loadHostProfileByName(hostName);
    // Test against this profile
  });
}
```

## Example: Full Evidence-Based Test

```typescript
import { test, expect } from '@playwright/test';
import {
  MockMCPHost,
  SessionPlayer,
  loadSession,
  loadHostProfileByName,
  ProtocolValidator,
} from 'mcp-apps-testing';
import * as fs from 'fs';

test('Evidence-based test against Claude', async () => {
  // Load the evidence-based profile
  const profile = loadHostProfileByName('claude', '1.0.0');
  
  // Create host with profile constraints
  const host = new MockMCPHost({
    hostProfile: 'Claude',
    autoRespond: true,
  });

  // Load and replay a real session
  const sessionJson = fs.readFileSync(
    './profiles/sessions/claude-basic-flow.json',
    'utf-8'
  );
  const session = loadSession(sessionJson);
  const player = new SessionPlayer(session);

  // Validate session integrity
  const validation = player.validateSession();
  expect(validation.valid).toBe(true);

  // Replay the session
  const result = await player.replay(host, {
    speed: 0,
    validate: true,
    onMessage: async (msg) => {
      console.log(`Replaying: ${msg.direction}`);
    },
  });

  expect(result.success).toBe(true);
  expect(result.errors).toHaveLength(0);

  // Validate all messages were protocol-compliant
  const validator = new ProtocolValidator();
  for (const msg of session.messages) {
    validator.validateMessage(msg.message);
  }
  expect(validator.hasErrors()).toBe(false);

  await host.cleanup();
});
```

## Limitations

Current evidence-based testing has these limitations:

1. **Recorded sessions are point-in-time snapshots**
   - May not reflect latest host versions
   - Edge cases might not be captured

2. **Manual recording required**
   - No automated session capture yet
   - Requires access to real hosts

3. **Limited host coverage**
   - Only Claude and VS Code sessions included
   - Other hosts need community contributions

4. **Session replay doesn't validate UI**
   - Only tests protocol messages
   - Combine with UI tests for full coverage

## Contributing Sessions

Help improve evidence-based testing by contributing recorded sessions:

1. Record sessions from real hosts
2. Document the context and environment
3. Include version information
4. Note any limitations or caveats
5. Submit as JSON files with metadata

See the [Contributing Guide](../CONTRIBUTING.md) for details.

## See Also

- [API Reference](./api-reference.md)
- [Getting Started](./getting-started.md)
- [Example Sessions](../profiles/sessions/)
- [Host Profiles](../profiles/)
