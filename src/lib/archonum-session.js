import { chromium } from 'playwright';

/**
 * Resource types we never need: the scrapers read image URLs from attributes,
 * not image data. Scripts and stylesheets stay, since rendering and the
 * bot-protection check depend on them. Credits are charged per MB transferred.
 */
const BLOCKED_RESOURCE_TYPES = new Set(['image', 'media', 'font']);

/** Set BLOCK_ASSETS=0 to load everything (useful to compare credit use). */
function assetBlockingEnabled() {
  return process.env.BLOCK_ASSETS !== '0';
}

/**
 * Opens one fresh Archonum session: a new credentialed CDP URL, attached through
 * Playwright. Every page visit calls this, so no session is ever reused between pages.
 */
export async function openArchonumPage(client) {
  const cdpUrl = await client.getCDPUrl();
  const browser = await chromium.connectOverCDP(cdpUrl, { timeout: 60_000 });
  try {
    // The Archonum gateway exposes a browser context that already has a page
    // open. Reuse that page, as the working test.js does, and only create one
    // if the context has none.
    const contexts = browser.contexts();
    if (contexts.length === 0) {
      throw new Error('No browser contexts exposed by the CDP endpoint.');
    }
    const context = contexts[0];
    const page = context.pages()[0] ?? (await context.newPage());
    page.setDefaultTimeout(30_000);
    if (assetBlockingEnabled()) {
      await page.route('**/*', (route) =>
        BLOCKED_RESOURCE_TYPES.has(route.request().resourceType()) ? route.abort() : route.continue(),
      );
    }
    return { browser, page };
  } catch (err) {
    await browser.close().catch(() => {});
    throw err;
  }
}

/**
 * Fails the attempt when the page is no longer on the URL we asked for. Another
 * navigation can take over a shared tab; the retry then gets a clean session.
 * Matches on the last path segment (the variant code), which survives slug redirects.
 */
export function assertOnPage(page, requestedUrl) {
  const code = new URL(requestedUrl).pathname.split('/').filter(Boolean).pop();
  if (!page.url().includes(code)) {
    throw new Error(`page navigated away from ${code}; now at ${page.url() || '(blank)'}`);
  }
}

/**
 * Upper bound for one page visit. Playwright can swallow internal CDP errors
 * inside event handlers, which leaves the awaited call pending forever; this
 * turns that hang into an ordinary, retryable failure.
 */
export const VISIT_TIMEOUT_MS = 180_000;

/** Runs `task(page)` in a fresh session and always disconnects afterwards. */
export async function withArchonumPage(client, task) {
  const { browser, page } = await openArchonumPage(client);
  let timer;
  const timedOut = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`page visit timed out after ${VISIT_TIMEOUT_MS / 1000}s`)),
      VISIT_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([task(page), timedOut]);
  } finally {
    clearTimeout(timer);
    // Disconnect without letting a wedged connection block the run.
    await Promise.race([browser.close().catch(() => {}), new Promise((r) => setTimeout(r, 10_000))]);
  }
}
