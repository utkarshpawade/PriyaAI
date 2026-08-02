import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = 3100;
const VOICE_PORT = 8788;

/**
 * The smoke test drives the real stack, not a mocked front end: it starts the
 * voice server and the Next app on dedicated ports and talks to them over the
 * actual WebSocket protocol.
 *
 * Providers are pinned to the zero-key path (browser STT/TTS + MockLLM), which
 * is both the fastest configuration and the one a reviewer with no credentials
 * will actually see.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    // Grants getUserMedia without a prompt; the worklet then runs for real.
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: 'pnpm --filter @rvagent/voice exec tsx src/server.ts',
      cwd: '../..',
      port: VOICE_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        PORT: String(VOICE_PORT),
        STT_PROVIDER: 'browser',
        LLM_PROVIDER: 'mock',
        TTS_PROVIDER: 'browser',
        ALLOWED_ORIGINS: `http://localhost:${WEB_PORT}`,
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: `pnpm exec next dev --turbopack --port ${WEB_PORT}`,
      port: WEB_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        NEXT_PUBLIC_VOICE_WS_URL: `ws://localhost:${VOICE_PORT}`,
        NEXT_PUBLIC_VOICE_HTTP_URL: `http://localhost:${VOICE_PORT}`,
        VOICE_SERVER_URL: `http://localhost:${VOICE_PORT}`,
      },
    },
  ],
});
