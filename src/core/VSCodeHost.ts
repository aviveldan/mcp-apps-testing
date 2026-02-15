/**
 * VSCodeHost — Launch and control VS Code with Playwright for E2E testing of MCP ext-apps.
 *
 * Uses Playwright's Electron support to drive a real VS Code instance. This enables
 * testing MCP ext-app webviews inside the actual VS Code host environment, catching
 * host-specific rendering and communication bugs that sandbox tests can't find.
 *
 * Requires VS Code to be installed or downloadable via @vscode/test-electron.
 */

import type { Page, FrameLocator } from '@playwright/test';
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

export interface VSCodeHostOptions {
  /** Path to VS Code executable. Auto-detected if omitted. */
  vscodeExecutablePath?: string;

  /** VS Code version to download when auto-detecting (requires @vscode/test-electron). Default: 'stable' */
  vscodeVersion?: string;

  /** Path to extension under development (loaded via --extensionDevelopmentPath) */
  extensionDevelopmentPath?: string;

  /** VSIX files to install before launching */
  extensionPaths?: string[];

  /** User data directory for isolated testing. A temp dir is created if omitted. */
  userDataDir?: string;

  /** Extensions directory for isolated testing. A temp dir is created if omitted. */
  extensionsDir?: string;

  /** Workspace folder or file to open */
  workspacePath?: string;

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
 * Use this for E2E testing of MCP ext-apps inside VS Code. The host handles
 * VS Code lifecycle (launch, extension install, cleanup) and provides helpers
 * for finding webview frames and automating VS Code UI.
 *
 * @example
 * ```typescript
 * const host = await VSCodeHost.launch({
 *   extensionDevelopmentPath: path.resolve(__dirname, '../my-extension'),
 *   workspacePath: path.resolve(__dirname, '../test-workspace'),
 * });
 *
 * await host.runCommand('myExtension.openMCPApp');
 * const webview = await host.waitForWebview({ tabTitle: 'My MCP App' });
 * await expect(webview.locator('h1')).toContainText('Hello');
 *
 * await host.cleanup();
 * ```
 */
export class VSCodeHost {
  private electronApp: ElectronApplication;
  private window: Page;
  private options: VSCodeHostOptions;
  private tempDirs: string[] = [];

  private constructor(
    electronApp: ElectronApplication,
    window: Page,
    options: VSCodeHostOptions,
    tempDirs: string[]
  ) {
    this.electronApp = electronApp;
    this.window = window;
    this.options = options;
    this.tempDirs = tempDirs;
  }

  /**
   * Launch VS Code with the given options and return a VSCodeHost handle.
   *
   * Installs any specified VSIX extensions, sets up an isolated user data
   * directory, and waits for VS Code's workbench to become interactive.
   */
  static async launch(options: VSCodeHostOptions = {}): Promise<VSCodeHost> {
    const execPath = options.vscodeExecutablePath ?? await VSCodeHost.resolveVSCodePath(options.vscodeVersion);
    const tempDirs: string[] = [];

    // Isolated user-data dir
    const userDataDir = options.userDataDir ?? VSCodeHost.createTempDir('vscode-mcp-test-user-', tempDirs);

    // Isolated extensions dir
    const extensionsDir = options.extensionsDir ?? VSCodeHost.createTempDir('vscode-mcp-test-ext-', tempDirs);

    // Install VSIX extensions into the isolated extensions dir
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

    if (options.workspacePath) {
      args.push(options.workspacePath);
    }

    // Launch VS Code via Playwright Electron
    const electron = await getElectron();
    const electronApp: ElectronApplication = await electron.launch({
      executablePath: execPath,
      args,
      timeout: options.launchTimeout ?? 30000,
    });

    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Wait for the VS Code workbench to fully render
    await window.waitForSelector('.monaco-workbench', {
      state: 'visible',
      timeout: options.launchTimeout ?? 30000,
    });

    // Wait for the status bar to appear — signals VS Code finished loading
    await window.waitForSelector('.statusbar', {
      state: 'visible',
      timeout: options.launchTimeout ?? 30000,
    });

    if (options.debug) {
      window.on('console', (msg) => console.log(`[VSCodeHost] ${msg.text()}`));
    }

    return new VSCodeHost(electronApp, window, options, tempDirs);
  }

  // ── Window access ─────────────────────────────────────────────

  /** The main VS Code Playwright Page. Use for low-level interactions. */
  getWindow(): Page {
    return this.window;
  }

  /** The underlying Playwright ElectronApplication. */
  getElectronApp(): ElectronApplication {
    return this.electronApp;
  }

  // ── Command palette ───────────────────────────────────────────

  /**
   * Open the VS Code command palette and execute a command by its ID or label.
   *
   * @param command - Command ID (e.g., `workbench.action.openSettings`) or
   *   a human-readable label (e.g., `Open Settings`).
   */
  async runCommand(command: string): Promise<void> {
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await this.window.keyboard.press(`${modifier}+Shift+P`);

    const input = this.window.locator('.quick-input-widget input');
    await input.waitFor({ state: 'visible', timeout: 5000 });

    // Ctrl+Shift+P prefills the input with ">". Using fill() would replace it,
    // turning the command palette into a file search. Type after the ">" instead.
    await input.pressSequentially(command, { delay: 30 });

    // Wait for a real command result to appear (not "No matching results")
    await this.window.locator(
      '.quick-input-list .monaco-list-row .label-name:not(:has-text("No matching results"))'
    ).first().waitFor({ state: 'visible', timeout: 10000 });

    await this.window.keyboard.press('Enter');
  }

  // ── Webview helpers ───────────────────────────────────────────

  /**
   * Get the FrameLocator for an MCP ext-app webview rendered inside VS Code.
   *
   * VS Code nests webview content inside two iframe layers:
   * ```
   * VS Code window
   *   └─ iframe.webview.ready   (outer sandbox)
   *        └─ #active-frame     (inner content frame — your ext-app)
   * ```
   *
   * If `tabTitle` is provided, the matching editor tab is activated first so
   * the correct webview is in the DOM.
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

  /**
   * Wait for a webview to appear in VS Code, then return its content frame.
   *
   * Useful after triggering a command that opens a new webview panel — it
   * polls until the webview iframe is present and ready.
   */
  async waitForWebview(options?: WebviewLocatorOptions): Promise<FrameLocator> {
    const timeout = options?.timeout ?? 15000;

    await this.window
      .locator('iframe.webview')
      .first()
      .waitFor({ state: 'attached', timeout });

    await this.window
      .locator('iframe.webview.ready')
      .first()
      .waitFor({ state: 'attached', timeout });

    return this.getWebviewFrame(options);
  }

  // ── Screenshots ───────────────────────────────────────────────

  /** Capture a screenshot of the full VS Code window. */
  async screenshot(filePath?: string): Promise<Buffer> {
    return await this.window.screenshot({ path: filePath });
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  /** Close VS Code and delete any temporary directories created for isolation. */
  async cleanup(): Promise<void> {
    try {
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
    // 1. Explicit env var
    if (process.env.VSCODE_PATH && fs.existsSync(process.env.VSCODE_PATH)) {
      return process.env.VSCODE_PATH;
    }

    const platform = process.platform;

    // 2. Well-known locations
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

    // 3. PATH lookup
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

    // 4. Download via @vscode/test-electron
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
}
