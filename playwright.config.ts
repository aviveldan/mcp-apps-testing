import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for MCP Apps Testing
 * Enhanced with trace viewer and protocol logging
 */
export default defineConfig({
  testDir: './examples',
  
  // Run tests in files in parallel
  fullyParallel: true,
  
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  
  // Retry on CI only
  retries: process.env.CI ? 2 : 0,
  
  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,
  
  // Reporter to use - includes HTML and list for better debugging
  reporter: [
    ['html'],
    ['list'],
  ],
  
  // Shared settings for all the projects below
  use: {
    // Collect trace on first retry and on failure for debugging
    trace: 'on-first-retry',
    
    // Take screenshot on failure
    screenshot: 'only-on-failure',
    
    // Record video on first retry
    video: 'retain-on-failure',
    
    // Extended timeout for async operations
    actionTimeout: 10000,
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
