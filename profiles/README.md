# Host Profiles and Recorded Sessions

This directory contains **evidence-based** host profiles and recorded protocol sessions from real MCP hosts (Claude Desktop, VS Code, etc.).

## Directory Structure

```
profiles/
├── README.md                           # This file
├── claude-v1.json                      # Claude Desktop v1.0 profile
├── vscode-v1.json                      # VS Code v1.0 profile
└── sessions/                           # Recorded protocol sessions
    ├── claude-basic-flow.json          # Claude basic initialization + tool call
    └── vscode-basic-flow.json          # VS Code basic initialization + tool call
```

## What Are Host Profiles?

Host profiles are **evidence-based configurations** that describe how specific MCP hosts (like Claude Desktop or VS Code) behave in practice. They include:

- **Capabilities**: What features the host supports
- **Constraints**: Viewport limits, allowed protocols, etc.
- **Theme**: CSS variables for light/dark modes
- **Behaviors**: How the host handles initialization, tool calls, etc.
- **Limitations**: Known gaps or assumptions in the profile
- **Metadata**: When recorded, from what source, etc.

## Why Evidence-Based?

Traditional mock host profiles are based on assumptions. Evidence-based profiles are derived from:

1. **Recorded Sessions**: Actual protocol flows captured from real hosts
2. **Manual Testing**: Direct observation of host behavior
3. **Version Tracking**: Dated snapshots that can be compared over time
4. **Documented Limitations**: Clear statements about what's not captured

This approach reduces false positives in tests and provides more realistic validation.

## Using Host Profiles

### Load a Profile in Tests

```typescript
import { loadHostProfileByName } from 'mcp-apps-testing';

const claudeProfile = loadHostProfileByName('claude', '1.0.0');
console.log('Capabilities:', claudeProfile.capabilities);
console.log('Limitations:', claudeProfile.limitations);
```

### Validate a Profile

```typescript
import { validateHostProfile } from 'mcp-apps-testing';

const validation = validateHostProfile(claudeProfile);
if (!validation.valid) {
  console.error('Errors:', validation.errors);
}
```

### Compare Profiles

```typescript
import { compareHostProfiles } from 'mcp-apps-testing';

const claude = loadHostProfileByName('claude', '1.0.0');
const vscode = loadHostProfileByName('vscode', '1.0.0');

const comparison = compareHostProfiles(claude, vscode);
console.log('Differences:', comparison.differences);
```

## Profile Structure

Each profile is a JSON file with this structure:

```json
{
  "version": "1.0.0",
  "recordedDate": "2024-01-15T10:30:00.000Z",
  "source": "Where/how this profile was created",
  "name": "Host Name",
  "hostVersion": "1.0.0",
  "protocolVersion": "2024-11-05",
  "capabilities": {
    "tools": { "listChanged": true },
    "resources": { "subscribe": true }
  },
  "theme": {
    "light": { "--background": "#fff" },
    "dark": { "--background": "#000" }
  },
  "constraints": {
    "maxViewportWidth": 1920,
    "maxViewportHeight": 1080,
    "allowedProtocols": ["http", "https"]
  },
  "behaviors": {
    "initialization": {},
    "toolCalls": {}
  },
  "limitations": [
    "List of known limitations",
    "What's not captured in this profile"
  ],
  "notes": "Additional context or caveats"
}
```

## Recorded Sessions

The `sessions/` directory contains captured protocol flows from real hosts.

### Session Structure

```json
{
  "metadata": {
    "recordedDate": "2024-01-15T10:30:00.000Z",
    "hostName": "Claude Desktop",
    "protocolVersion": "2024-11-05",
    "description": "What this session demonstrates",
    "source": "How it was recorded"
  },
  "capabilities": { },
  "constraints": { },
  "messages": [
    {
      "timestamp": 0,
      "direction": "client-to-server",
      "message": { "jsonrpc": "2.0", "id": 1, "method": "initialize" }
    }
  ]
}
```

### Using Sessions

```typescript
import { SessionPlayer, loadSession } from 'mcp-apps-testing';

const session = loadSession(fs.readFileSync('./profiles/sessions/claude-basic-flow.json'));
const player = new SessionPlayer(session);

const host = new MockMCPHost({ autoRespond: true });
const result = await player.replay(host, { validate: true });
```

## Current Profiles

### Claude Desktop (claude-v1.json)

- **Version**: 1.0.0
- **Recorded**: 2024-01-15
- **Source**: Manual testing with Claude Desktop app
- **Capabilities**: Full MCP support (tools, resources, prompts)
- **Key Features**:
  - Supports resource subscriptions
  - Supports prompt list changes
  - Wide viewport (1920x1080)
  - Allows http, https, data protocols

**Limitations:**
- Based on limited manual testing
- May not reflect all edge cases
- Theme colors are approximate

### VS Code (vscode-v1.json)

- **Version**: 1.0.0
- **Recorded**: 2024-01-15
- **Source**: Manual testing with VS Code MCP extension
- **Capabilities**: Editor-focused MCP support
- **Key Features**:
  - Does NOT support resource subscriptions
  - Does NOT support prompt list changes
  - Narrower viewport (1600x900)
  - Allows vscode:// protocol

**Limitations:**
- Extension-specific behavior
- May vary by VS Code version
- Does not cover all extension features

## Contributing New Profiles

We welcome contributions of recorded sessions and profiles from the community!

### Recording a Session

1. **Set up monitoring**: Use browser dev tools or MCP Inspector
2. **Capture traffic**: Record protocol messages during interaction
3. **Save as JSON**: Use the SessionRecorder API
4. **Document context**: Include version, date, source

Example:

```typescript
import { SessionRecorder } from 'mcp-apps-testing';

const recorder = new SessionRecorder({
  hostName: 'My Host',
  hostVersion: '1.0.0',
  protocolVersion: '2024-11-05',
  description: 'Basic flow description',
  source: 'Recorded from X during Y'
});

recorder.startRecording();
// ... interact with host ...
recorder.stopRecording();

recorder.saveSession('./my-session.json', constraints, capabilities);
```

### Creating a Profile

1. **Base on recordings**: Use one or more session files
2. **Extract common patterns**: Identify consistent behaviors
3. **Document limitations**: Be clear about what's not covered
4. **Version it**: Use semantic versioning (v1.0.0, v1.1.0, etc.)
5. **Include metadata**: Date, source, host version

### Submission Guidelines

- Include both profile and session files
- Document how the data was collected
- Note any assumptions or caveats
- Update this README with your addition

## Versioning

Profiles use semantic versioning:

- **Major version (1.x.x)**: Breaking changes in capabilities or behavior
- **Minor version (x.1.x)**: New features or expanded coverage
- **Patch version (x.x.1)**: Bug fixes or clarifications

When a host updates significantly, create a new major version (e.g., claude-v2.json).

## Maintenance

Profiles should be re-recorded periodically to ensure they reflect current host behavior:

- **Quarterly**: Check for major host updates
- **On release**: When hosts publish new versions
- **On bug reports**: If users report mismatches

## See Also

- [Evidence-Based Testing Guide](../docs/evidence-based-testing.md)
- [API Reference](../docs/api-reference.md)
- [Session Replay Examples](../examples/session-replay.spec.ts)
- [Host Profile Examples](../examples/host-profiles.spec.ts)

## Questions?

If you have questions about profiles or want to contribute:

1. Open an issue on GitHub
2. Check existing sessions for examples
3. Read the Evidence-Based Testing Guide

---

**Remember**: These profiles are snapshots in time. Real hosts may behave differently. Always test against actual hosts when possible!
