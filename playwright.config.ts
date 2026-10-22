import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';

// Next.js reads .env.local for the dev server below; Playwright does not, and the tests that
// seed data need SUPABASE_SERVICE_ROLE_KEY. Variables already set (CI) are left alone.
try {
  process.loadEnvFile(join(import.meta.dirname, '.env.local'));
} catch {
  // No .env.local: nothing to load.
}

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Two workers locally: with more, cold dev-server compiles under load make the OTP callback redirect time out.
  workers: process.env.CI ? undefined : 2,
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      // Mobile-first app. Locally this drives the Chrome already installed on the
      // machine, so no browser download is needed; CI uses Playwright's bundled
      // Chromium (npx playwright install chromium).
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'], channel: process.env.CI ? undefined : 'chrome' },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
