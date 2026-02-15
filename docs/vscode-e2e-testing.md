# VS Code Container E2E Testing

Test your MCP ext-apps inside a **real VS Code instance** using Playwright's Electron support. This catches host-specific rendering and communication bugs that the ReferenceHost sandbox cannot reproduce.

## When to Use This

| Layer | Tool | Speed | Coverage | Use for |
|-------|------|-------|----------|---------|
| 1 | `MockMCPHost` | ⚡ Instant | Protocol only | Every PR — unit tests |
| 2 | `ReferenceHost` | Fast (~2s) | ~90% of real behavior | Every PR — E2E sandbox |
| **3** | **`VSCodeHost`** | Slow (~30s) | **100% real VS Code** | **Nightly / release gate** |

Use `VSCodeHost` when you need to verify:
- Webview rendering inside VS Code's iframe sandbox
- VS Code theme integration (light/dark, high contrast)
- Extension activation and lifecycle
- Command palette interactions
- Side-by-side behavior with other extensions

## Quick Start

### 1. Install Dependencies

```bash
npm install mcp-apps-testing @playwright/test --save-dev

# Optional: auto-download VS Code in CI
npm install @vscode/test-electron --save-dev
```

### 2. Write a Test

```typescript
import { test, expect } from '@playwright/test';
import { VSCodeHost } from 'mcp-apps-testing';
import * as path from 'path';

test('MCP ext-app renders in VS Code', async () => {
  const host = await VSCodeHost.launch({
    extensionDevelopmentPath: path.resolve(__dirname, '../my-extension'),
    workspacePath: path.resolve(__dirname, '../test-workspace'),
  });

  const window = host.getWindow();
  await expect(window.locator('.monaco-workbench')).toBeVisible({ timeout: 30000 });

  // Trigger your MCP tool
  await host.runCommand('myExtension.openMCPApp');

  // Find the ext-app webview
  const webview = await host.waitForWebview({ tabTitle: 'My MCP App' });

  // Assert on the rendered UI
  await expect(webview.locator('h1')).toContainText('Hello');
  await expect(webview.locator('.status')).toHaveText('Connected');

  // Screenshot for visual regression
  await host.screenshot('screenshots/mcp-app-vscode.png');

  await host.cleanup();
});
```

### 3. Run the Test

```bash
# Local (VS Code must be installed)
npx playwright test my-vscode-test.spec.ts

# Explicit VS Code path
VSCODE_PATH=/path/to/code npx playwright test my-vscode-test.spec.ts

# Linux CI with xvfb
xvfb-run npx playwright test my-vscode-test.spec.ts
```

## API

### `VSCodeHost.launch(options?)`

Launches VS Code and returns a `VSCodeHost` handle.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `vscodeExecutablePath` | `string` | auto-detect | Path to VS Code binary |
| `vscodeVersion` | `string` | `'stable'` | Version for auto-download |
| `extensionDevelopmentPath` | `string` | — | Extension source to load |
| `extensionPaths` | `string[]` | — | VSIX files to install |
| `userDataDir` | `string` | temp dir | Isolated user data |
| `extensionsDir` | `string` | temp dir | Isolated extensions |
| `workspacePath` | `string` | — | Workspace to open |
| `debug` | `boolean` | `false` | Log console output |
| `launchTimeout` | `number` | `30000` | Launch timeout (ms) |
| `extraArgs` | `string[]` | — | Extra VS Code CLI args |

### `host.getWindow(): Page`

Returns the Playwright `Page` for the VS Code window.

### `host.runCommand(command: string)`

Opens the command palette and executes a command by ID or label.

### `host.waitForWebview(options?)`

Waits for a webview to appear and returns its content `FrameLocator`.

### `host.getWebviewFrame(options?)`

Returns the content `FrameLocator` of an existing webview.

### `host.screenshot(path?)`

Captures a screenshot of the VS Code window.

### `host.cleanup()`

Closes VS Code and deletes temporary directories.

### `VSCodeHost.resolveVSCodePath(version?)`

Static utility to find the VS Code executable. Resolution order:
1. `VSCODE_PATH` environment variable
2. Well-known installation paths per platform
3. `which`/`where` lookup on PATH
4. Download via `@vscode/test-electron` (if installed)

## VS Code Webview Structure

VS Code renders webviews inside nested iframes. `VSCodeHost` handles this automatically:

```
VS Code Electron window
  └─ .monaco-workbench
       └─ iframe.webview.ready      ← outer sandbox
            └─ #active-frame        ← inner content frame (your ext-app HTML)
```

When you call `getWebviewFrame()` or `waitForWebview()`, you get a `FrameLocator` pointing at the inner `#active-frame` — the same context where your ext-app JavaScript runs.

## Container Setup for CI

### Dockerfile

```dockerfile
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

# Install VS Code dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm1 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci

# Download VS Code (cached in image layer)
RUN npx @vscode/test-electron --download stable

COPY . .
RUN npm run build

# Run with xvfb for headless display
CMD ["xvfb-run", "--auto-servernum", "npx", "playwright", "test"]
```

### GitHub Actions Workflow

```yaml
name: VS Code E2E Tests

on:
  schedule:
    - cron: '0 2 * * *'  # Nightly at 2 AM
  workflow_dispatch:

jobs:
  vscode-e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Download VS Code
        run: npx @vscode/test-electron --download stable

      - name: Run VS Code E2E tests
        run: xvfb-run --auto-servernum npx playwright test examples/vscode-e2e.spec.ts
        env:
          VSCODE_E2E: '1'
          EXTENSION_DEV_PATH: ./my-extension
          WORKSPACE_PATH: ./test-workspace

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: vscode-e2e-results
          path: |
            test-results/
            screenshots/
```

## Playwright Configuration

Add a separate project for VS Code E2E tests to keep them isolated from fast unit/sandbox tests:

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  projects: [
    {
      name: 'unit',
      testDir: './tests/unit',
    },
    {
      name: 'sandbox',
      testDir: './tests/sandbox',
      use: { browserName: 'chromium' },
    },
    {
      name: 'vscode-e2e',
      testDir: './tests/vscode-e2e',
      timeout: 120000,
      retries: 1,
      // No browser needed — VSCodeHost uses Electron directly
    },
  ],
});
```

Run only VS Code E2E tests:
```bash
npx playwright test --project=vscode-e2e
```

## Tips

### Theme Testing

VS Code applies CSS variables to webviews. Test both light and dark themes:

```typescript
test('renders correctly in dark theme', async () => {
  const host = await VSCodeHost.launch({ /* ... */ });

  // Switch to dark theme
  await host.runCommand('Preferences: Color Theme');
  const window = host.getWindow();
  await window.locator('.quick-input-list-row', { hasText: 'Dark+' }).click();

  const webview = await host.getWebviewFrame({ tabTitle: 'My App' });
  const bg = await webview.locator('body').evaluate(
    el => getComputedStyle(el).backgroundColor
  );
  // Verify dark background
  expect(bg).not.toBe('rgb(255, 255, 255)');
});
```

### Debugging Failures

1. **Set `debug: true`** to log VS Code console output
2. **Take screenshots** on failure with `host.screenshot()`
3. **Use Playwright traces** — add `trace: 'on-first-retry'` to config
4. **Run locally** without xvfb to see VS Code visually:
   ```bash
   VSCODE_E2E=1 npx playwright test --headed
   ```

### Extension Development Path

For extensions under development, use `extensionDevelopmentPath`:

```typescript
const host = await VSCodeHost.launch({
  extensionDevelopmentPath: path.resolve(__dirname, '../../'),
  workspacePath: path.resolve(__dirname, '../fixtures/workspace'),
});
```

This tells VS Code to load the extension from source without packaging it as a VSIX.

### Multiple Extensions

Install additional extensions alongside your development extension:

```typescript
const host = await VSCodeHost.launch({
  extensionDevelopmentPath: './my-extension',
  extensionPaths: [
    './fixtures/helper-extension.vsix',
    './fixtures/theme-extension.vsix',
  ],
});
```
