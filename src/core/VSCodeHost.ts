/**
 * VSCodeHost — Launch and control VS Code with Playwright for E2E testing of MCP ext-apps.
 *
 * Uses Playwright's Electron support to drive a real VS Code instance. This enables
 * testing MCP ext-app webviews inside the actual VS Code host environment, catching
 * host-specific rendering and communication bugs that sandbox tests can't find.
 *
 * The host provides a clean-room environment for each test:
 * - Fresh workspace with only your MCP server configured
 * - Fresh extensions dir with only Copilot (no other extensions)
 * - Uses your real VS Code user-data for auth (read-only for credentials)
 * - Temp dirs cleaned up automatically
 *
 * Requires VS Code with GitHub Copilot Chat extension installed.
 */

import type { Page, FrameLocator, Locator } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';

// Lazy-loaded to avoid conflicts with Playwright test runner's browser setup.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _electronModule: any;
async function getElectron() {
  if (!_electronModule) {
    const pw = await import('@playwright/test');
    _electronModule = pw._electron;
  }
  return _electronModule;
}

type ElectronApplication = {
  firstWindow(): Promise<Page>;
  close(): Promise<void>;
};

export interface MCPServerConfig {
  /** Transport type */
  type: 'stdio' | 'http' | 'sse';
  /** Command to run (for stdio) */
  command?: string;
  /** Arguments (for stdio) */
  args?: string[];
  /** URL (for http/sse) */
  url?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** HTTP headers (for http/sse) */
  headers?: Record<string, string>;
}

export interface VSCodeHostOptions {
  /** Path to VS Code executable. Auto-detected if omitted. */
  vscodeExecutablePath?: string;

  /** VS Code version to download when auto-detecting (requires @vscode/test-electron). Default: 'stable' */
  vscodeVersion?: string;

  /** Path to extension under development (loaded via --extensionDevelopmentPath) */
  extensionDevelopmentPath?: string;

  /** VSIX files to install before launching */
  extensionPaths?: string[];

  /**
   * User data directory. Uses your real VS Code user-data by default
   * (for Copilot auth). Set to a custom path for full isolation.
   */
  userDataDir?: string;

  /** Extensions directory for isolated testing. A temp dir with only Copilot is created if omitted. */
  extensionsDir?: string;

  /** Workspace folder to open. A temp workspace is created if omitted. */
  workspacePath?: string;

  /**
   * MCP servers to configure in the workspace.
   * Written to .vscode/mcp.json — ONLY these servers will be available.
   */
  mcpServers?: Record<string, MCPServerConfig>;

  /** Enable verbose logging */
  debug?: boolean;

  /** Timeout for VS Code to launch in ms (default: 30000) */
  launchTimeout?: number;

  /** Additional VS Code CLI arguments */
  extraArgs?: string[];
}

export interface WebviewLocatorOptions {
  /** Editor tab title to activate before locating the webview */
  tabTitle?: string;

  /** Timeout in ms (default: 10000) */
  timeout?: number;
}

/**
 * Drives a real VS Code instance via Playwright's Electron support.
 *
 * Provides a **clean-room** for MCP ext-app testing:
 * - Fresh workspace with only your MCP server in .vscode/mcp.json
 * - Fresh extensions dir with only Copilot Chat (no other extensions)
 * - Your real user-data-dir for Copilot auth (no chat history leaks — fresh session)
 *
 * @example
 * ```typescript
 * const host = await VSCodeHost.launch({
 *   mcpServers: {
 *     'my-server': { type: 'stdio', command: 'node', args: ['./server.js'] },
 *   },
 * });
 *
 * const chat = await host.openChat();
 * await chat.send('Use the hello tool with name "Test"');
 * await chat.allowTool();
 * const response = await chat.waitForResponse();
 *
 * // Assert on the response text or ext-app UI
 * await expect(response).toContainText('Hello, Test');
 *
 * await host.cleanup();
 * ```
 */
export class VSCodeHost {
  private electronApp: ElectronApplication;
  private window: Page;
  private options: VSCodeHostOptions;
  private tempDirs: string[] = [];
  private workspaceDir: string;

  private constructor(
    electronApp: ElectronApplication,
    window: Page,
    options: VSCodeHostOptions,
    tempDirs: string[],
    workspaceDir: string
  ) {
    this.electronApp = electronApp;
    this.window = window;
    this.options = options;
    this.tempDirs = tempDirs;
    this.workspaceDir = workspaceDir;
  }

  /**
   * Launch VS Code in a clean-room environment for MCP ext-app testing.
   *
   * Sets up:
   * 1. Fresh workspace with .vscode/mcp.json (only specified servers)
   * 2. Fresh extensions dir with only Copilot Chat
   * 3. Real user-data-dir for Copilot auth
   */
  static async launch(options: VSCodeHostOptions = {}): Promise<VSCodeHost> {
    const execPath = options.vscodeExecutablePath ?? await VSCodeHost.resolveVSCodePath(options.vscodeVersion);
    const tempDirs: string[] = [];

    // Workspace — fresh temp dir or user-provided
    let workspaceDir: string;
    if (options.workspacePath) {
      workspaceDir = options.workspacePath;
    } else {
      workspaceDir = VSCodeHost.createTempDir('vscode-mcp-workspace-', tempDirs);
    }

    // Write .vscode/mcp.json with only the specified MCP servers
    const vscodeDir = path.join(workspaceDir, '.vscode');
    if (!fs.existsSync(vscodeDir)) {
      fs.mkdirSync(vscodeDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(vscodeDir, 'mcp.json'),
      JSON.stringify({ servers: options.mcpServers ?? {} }, null, 2)
    );
    // Workspace settings: suppress noise, disable MCP auto-discovery
    fs.writeFileSync(
      path.join(vscodeDir, 'settings.json'),
      JSON.stringify({
        'chat.mcp.discovery.enabled': false,
        'extensions.ignoreRecommendations': true,
        'workbench.startupEditor': 'none',
        'update.mode': 'none',
      }, null, 2)
    );

    // Extensions dir — fresh with only Copilot
    let extensionsDir: string;
    if (options.extensionsDir) {
      extensionsDir = options.extensionsDir;
    } else {
      extensionsDir = VSCodeHost.createTempDir('vscode-mcp-ext-', tempDirs);
      VSCodeHost.copyCopilotExtensions(extensionsDir);
    }

    // Install VSIX extensions
    if (options.extensionPaths?.length) {
      for (const vsixPath of options.extensionPaths) {
        try {
          execSync(
            `"${execPath}" --extensions-dir "${extensionsDir}" --install-extension "${vsixPath}" --force`,
            { stdio: 'pipe' }
          );
        } catch (err) {
          throw new Error(
            `Failed to install extension ${vsixPath}: ${(err as Error).message}`
          );
        }
      }
    }

    // User data — real dir for auth, or user-provided
    const userDataDir = options.userDataDir ?? VSCodeHost.getDefaultUserDataDir();

    // Build launch args
    const args: string[] = [
      `--user-data-dir=${userDataDir}`,
      `--extensions-dir=${extensionsDir}`,
      '--no-sandbox',
      '--disable-gpu-sandbox',
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-workspace-trust',
      '--disable-telemetry',
    ];

    if (options.extensionDevelopmentPath) {
      args.push(`--extensionDevelopmentPath=${options.extensionDevelopmentPath}`);
    }

    if (options.extraArgs) {
      args.push(...options.extraArgs);
    }

    args.push(workspaceDir);

    // Launch VS Code via Playwright Electron
    const electron = await getElectron();
    const electronApp: ElectronApplication = await electron.launch({
      executablePath: execPath,
      args,
      timeout: options.launchTimeout ?? 30000,
    });

    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Wait for the VS Code workbench + status bar to fully render
    const timeout = options.launchTimeout ?? 30000;
    await window.waitForSelector('.monaco-workbench', { state: 'visible', timeout });
    await window.waitForSelector('.statusbar', { state: 'visible', timeout });

    if (options.debug) {
      window.on('console', (msg) => console.log(`[VSCodeHost] ${msg.text()}`));
    }

    return new VSCodeHost(electronApp, window, options, tempDirs, workspaceDir);
  }

  // ── Window access ─────────────────────────────────────────────

  /** The main VS Code Playwright Page. */
  getWindow(): Page {
    return this.window;
  }

  /** The underlying Playwright ElectronApplication. */
  getElectronApp(): ElectronApplication {
    return this.electronApp;
  }

  /** The workspace directory being used. */
  getWorkspaceDir(): string {
    return this.workspaceDir;
  }

  // ── Command palette ───────────────────────────────────────────

  /**
   * Open the command palette and execute a command by label.
   *
   * Ctrl+Shift+P prefills ">". We use pressSequentially to append after it.
   */
  async runCommand(command: string): Promise<void> {
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await this.window.keyboard.press(`${modifier}+Shift+P`);

    const input = this.window.locator('.quick-input-widget input');
    await input.waitFor({ state: 'visible', timeout: 5000 });
    await input.pressSequentially(command, { delay: 30 });

    await this.window.locator(
      '.quick-input-list .monaco-list-row .label-name:not(:has-text("No matching results"))'
    ).first().waitFor({ state: 'visible', timeout: 10000 });

    await this.window.keyboard.press('Enter');
  }

  // ── MCP Server management ─────────────────────────────────────

  /**
   * Add or update an MCP server in the workspace's .vscode/mcp.json.
   * The server will be discovered by VS Code's MCP integration.
   */
  async configureMCPServer(name: string, config: MCPServerConfig): Promise<void> {
    const mcpJsonPath = path.join(this.workspaceDir, '.vscode', 'mcp.json');
    let mcpConfig: { servers: Record<string, MCPServerConfig> };
    try {
      mcpConfig = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'));
    } catch {
      mcpConfig = { servers: {} };
    }
    mcpConfig.servers[name] = config;
    fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2));
  }

  // ── Copilot Chat ──────────────────────────────────────────────

  /**
   * Open Copilot Chat and return a ChatHandle for interacting with it.
   *
   * @param mode - 'agent' (default, needed for MCP tools) or 'ask'
   */
  async openChat(mode: 'agent' | 'ask' = 'agent'): Promise<ChatHandle> {
    const cmdLabel = mode === 'agent' ? 'Chat: Open Chat (Agent)' : 'Chat: Open Chat (Ask)';
    await this.runCommand(cmdLabel);

    // Wait for chat panel to appear
    await this.window.locator('.interactive-session').waitFor({ state: 'visible', timeout: 10000 });
    // Wait for the chat input editor to be ready
    await this.window.locator('.interactive-input-editor .monaco-editor').waitFor({ state: 'visible', timeout: 5000 });

    return new ChatHandle(this.window);
  }

  // ── Webview helpers ───────────────────────────────────────────

  /**
   * Get the FrameLocator for an MCP ext-app webview rendered inside VS Code.
   * Handles VS Code's nested iframe structure (webview.ready → #active-frame).
   */
  async getWebviewFrame(options?: WebviewLocatorOptions): Promise<FrameLocator> {
    const timeout = options?.timeout ?? 10000;

    if (options?.tabTitle) {
      await this.window
        .locator('.tab', { hasText: options.tabTitle })
        .first()
        .click({ timeout });
    }

    const outerFrame = this.window.frameLocator('iframe.webview.ready').first();
    return outerFrame.frameLocator('#active-frame');
  }

  /** Wait for a webview to appear in VS Code, then return its content frame. */
  async waitForWebview(options?: WebviewLocatorOptions): Promise<FrameLocator> {
    const timeout = options?.timeout ?? 15000;
    await this.window.locator('iframe.webview.ready').first()
      .waitFor({ state: 'attached', timeout });
    return this.getWebviewFrame(options);
  }

  // ── Screenshots ───────────────────────────────────────────────

  /** Capture a screenshot of the full VS Code window. */
  async screenshot(filePath?: string): Promise<Buffer> {
    return await this.window.screenshot({ path: filePath });
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  /**
   * Close VS Code and delete any temporary directories.
   * Handles the "active session" confirmation dialog automatically.
   */
  async cleanup(): Promise<void> {
    try {
      // Dismiss any "active session" exit confirmation dialogs
      const dialog = this.window.locator('.dialog-box .dialog-buttons .monaco-button').first();
      const hasDialog = await dialog.isVisible({ timeout: 500 }).catch(() => false);
      if (hasDialog) {
        await dialog.click();
      }
    } catch {
      // No dialog
    }

    try {
      // Register a handler for the native "before close" dialog
      this.window.on('dialog', (d) => d.accept().catch(() => {}));
      await this.electronApp.close();
    } catch {
      // VS Code may have already closed
    }

    for (const dir of this.tempDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup
      }
    }
  }

  // ── Static utilities ──────────────────────────────────────────

  /**
   * Resolve the path to the VS Code executable.
   *
   * Resolution order:
   * 1. `VSCODE_PATH` environment variable
   * 2. Well-known installation paths per platform
   * 3. `which`/`where` lookup on PATH
   * 4. Download via `@vscode/test-electron` (if installed)
   */
  static async resolveVSCodePath(version?: string): Promise<string> {
    if (process.env.VSCODE_PATH && fs.existsSync(process.env.VSCODE_PATH)) {
      return process.env.VSCODE_PATH;
    }

    const platform = process.platform;
    const candidates: string[] = [];

    if (platform === 'win32') {
      const localAppData = process.env.LOCALAPPDATA || '';
      candidates.push(
        path.join(localAppData, 'Programs', 'Microsoft VS Code', 'Code.exe'),
        path.join(localAppData, 'Programs', 'Microsoft VS Code Insiders', 'Code - Insiders.exe'),
      );
    } else if (platform === 'darwin') {
      candidates.push(
        '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
        '/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Electron',
      );
    } else {
      candidates.push(
        '/usr/share/code/code',
        '/usr/bin/code',
        '/snap/bin/code',
      );
    }

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    try {
      const cmd = platform === 'win32' ? 'where code' : 'which code';
      const result = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
        .trim()
        .split(/\r?\n/)[0];
      if (result && fs.existsSync(result)) {
        return result;
      }
    } catch {
      // Not found on PATH
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { downloadAndUnzipVSCode } = require('@vscode/test-electron');
      return await downloadAndUnzipVSCode(version ?? 'stable');
    } catch {
      // Package not installed
    }

    throw new Error(
      'Could not find a VS Code installation. Either:\n' +
      '  • Set the VSCODE_PATH environment variable\n' +
      '  • Provide the vscodeExecutablePath option\n' +
      '  • Install @vscode/test-electron (npm i -D @vscode/test-electron) for automatic download',
    );
  }

  // ── Private helpers ───────────────────────────────────────────

  private static createTempDir(prefix: string, tracker: string[]): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tracker.push(dir);
    return dir;
  }

  /** Get the default VS Code user-data directory (per platform). */
  private static getDefaultUserDataDir(): string {
    if (process.platform === 'win32') {
      return path.join(process.env.APPDATA || '', 'Code');
    } else if (process.platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Application Support', 'Code');
    }
    return path.join(os.homedir(), '.config', 'Code');
  }

  /**
   * Copy only Copilot extensions from the user's real extensions dir
   * into the fresh isolated extensions dir.
   */
  private static copyCopilotExtensions(targetDir: string): void {
    const realExtDir = path.join(os.homedir(), '.vscode', 'extensions');
    if (!fs.existsSync(realExtDir)) return;

    const entries = fs.readdirSync(realExtDir);
    // Copy github.copilot-chat-* and github.copilot-* (base extension)
    for (const prefix of ['github.copilot-chat-', 'github.copilot-']) {
      const matches = entries.filter(d => d.startsWith(prefix));
      if (matches.length > 0) {
        const latest = matches.sort().pop()!;
        const src = path.join(realExtDir, latest);
        const dst = path.join(targetDir, latest);
        if (!fs.existsSync(dst)) {
          fs.cpSync(src, dst, { recursive: true });
        }
      }
    }
  }
}

/**
 * Handle for interacting with an open Copilot Chat session.
 *
 * DOM structure reference (VS Code 1.102+):
 * ```
 * .interactive-session
 *   .interactive-list
 *     [role="list"][aria-label="Chat"]
 *       .monaco-list-row.request        ← user messages
 *       .monaco-list-row                ← assistant responses
 *         .chat-tool-invocation-part    ← MCP tool call
 *           .chat-confirmation-widget-container ← Allow/Skip dialog
 * ```
 */
export class ChatHandle {
  private window: Page;

  constructor(window: Page) {
    this.window = window;
  }

  /**
   * Type and send a chat message.
   */
  async send(message: string): Promise<void> {
    const editor = this.window.locator('.interactive-input-editor .monaco-editor');
    await editor.click();
    await this.window.keyboard.type(message, { delay: 15 });
    await this.window.keyboard.press('Enter');
  }

  /**
   * Click "Allow" on the MCP tool confirmation dialog.
   *
   * When Copilot wants to call an MCP tool, VS Code shows a confirmation
   * with the tool name and inputs. This clicks the primary allow button.
   */
  async allowTool(timeout = 30000): Promise<void> {
    // Wait for the confirmation widget to appear
    const confirmation = this.window.locator('.chat-tool-invocation-part.has-confirmation');
    await confirmation.first().waitFor({ state: 'visible', timeout });

    // The primary button (Allow/Continue) is the non-secondary button
    const allowBtn = confirmation.locator('.monaco-button').filter({
      hasNot: this.window.locator('.secondary'),
    }).first();

    // If no explicit allow button, look for the button that is NOT "Skip"
    const isVisible = await allowBtn.isVisible({ timeout: 2000 }).catch(() => false);
    if (isVisible) {
      await allowBtn.click();
    } else {
      // Fallback: press Ctrl+Enter which is the keyboard shortcut for "Allow"
      await this.window.keyboard.press('Control+Enter');
    }
  }

  /**
   * Click "Skip" on the MCP tool confirmation dialog.
   */
  async skipTool(timeout = 15000): Promise<void> {
    const skipBtn = this.window.locator('.chat-tool-invocation-part .monaco-button.secondary')
      .filter({ hasText: 'Skip' });
    await skipBtn.first().waitFor({ state: 'visible', timeout });
    await skipBtn.first().click();
  }

  /**
   * Wait for the assistant to finish responding (no more loading indicator).
   */
  async waitForResponse(timeout = 60000): Promise<Locator> {
    // Wait for loading to finish — the .chat-response-loading class disappears
    await this.window.locator('.chat-response-loading').waitFor({ state: 'detached', timeout });

    // Return the last response row
    return this.window.locator('.interactive-list [role="list"] .monaco-list-row').last();
  }

  /**
   * Wait for a tool invocation to appear in the chat.
   * Returns a locator for the tool invocation element.
   */
  async waitForToolCall(timeout = 30000): Promise<Locator> {
    const toolPart = this.window.locator('.chat-tool-invocation-part');
    await toolPart.first().waitFor({ state: 'visible', timeout });
    return toolPart.first();
  }

  /**
   * Get all visible chat messages as an array of { role, text } objects.
   */
  async getMessages(): Promise<Array<{ role: 'user' | 'assistant'; text: string }>> {
    return await this.window.evaluate(() => {
      const rows = document.querySelectorAll('.interactive-list [role="list"] .monaco-list-row');
      return Array.from(rows).map(row => {
        const isRequest = row.classList.contains('request');
        const textEl = row.querySelector('.chat-markdown-part') || row.querySelector('.value');
        return {
          role: (isRequest ? 'user' : 'assistant') as 'user' | 'assistant',
          text: textEl?.textContent?.trim() || '',
        };
      }).filter(m => m.text);
    });
  }

  /**
   * Get a FrameLocator for an ext-app iframe rendered inside a chat response.
   *
   * MCP ext-apps that return UI render inside the chat as:
   * ```
   * .mcp-app-container
   *   └─ iframe.mcp-app-webview
   * ```
   */
  async waitForExtApp(timeout = 15000): Promise<FrameLocator> {
    const container = this.window.locator('.interactive-list .mcp-app-container, .interactive-list iframe');
    await container.first().waitFor({ state: 'attached', timeout });

    // The ext-app may be in a direct iframe or nested
    const iframe = this.window.locator('.interactive-list iframe').first();
    await iframe.waitFor({ state: 'attached', timeout });
    return this.window.frameLocator('.interactive-list iframe').first();
  }
}
