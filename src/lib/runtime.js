import { ArchonumClient } from '@archonum/sdk';

/**
 * Builds the Archonum client from ARCHONUM_* environment variables. The token
 * is never written to logs or files by this project.
 */
export function createArchonumClient() {
  try {
    return ArchonumClient.fromEnv({ connectRetries: 5, retryDelayMs: 2000 });
  } catch (err) {
    throw new Error(`${err.message}. Set ARCHONUM_API_TOKEN (see README.md).`);
  }
}

export function log(message) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
}

export function describeError(err) {
  return err instanceof Error ? err.message.split('\n')[0] : String(err);
}

/**
 * Playwright sometimes throws internal CDP assertion errors from inside event
 * handlers. Nothing awaits those, so they arrive as uncaught exceptions. When
 * the stack comes from playwright-core, log it and keep running: the affected
 * page visit then times out and is retried. Any other uncaught error still
 * stops the process.
 */
export function installPlaywrightGuard() {
  process.on('uncaughtException', (err) => {
    if (err?.stack?.includes('playwright-core')) {
      log(`Playwright internal error (affected page will be retried): ${describeError(err)}`);
      return;
    }
    console.error(err);
    process.exit(1);
  });
}
