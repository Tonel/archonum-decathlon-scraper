#!/usr/bin/env node
/**
 * Step 1: collects unique product URLs from a Decathlon category.
 *
 *   npm run discover -- [--target=1000] [--concurrency=3] [--category=<url>]
 *
 * Listing pages are visited --concurrency at a time (default 3), each in its own
 * Archonum session. No new page starts once the target is reached, so the run
 * ends after the batch that reaches the target. The URL list is saved to
 * data/product-urls.json after every page, so an interrupted run resumes where
 * it stopped.
 */
import { withRetry } from '@archonum/sdk';
import { DEFAULTS, PATHS, resolveConfig } from './config.js';
import { fetchListingPage } from './lib/listing.js';
import { runPool } from './lib/pool.js';
import { createArchonumClient, describeError, installPlaywrightGuard, log } from './lib/runtime.js';
import {
  addUniqueUrls,
  createSerialRunner,
  emptyUrlStore,
  readJsonIfExists,
  writeJsonAtomic,
} from './lib/store.js';
import { listingPageUrl } from './lib/url-utils.js';

async function main() {
  installPlaywrightGuard();
  const config = resolveConfig({
    defaultConcurrency: DEFAULTS.concurrency.discover,
    concurrencyEnv: 'DISCOVER_CONCURRENCY',
  });
  const client = createArchonumClient();

  const stored = await readJsonIfExists(PATHS.urlStore);
  if (stored && stored.category !== config.categoryUrl) {
    throw new Error(
      `${PATHS.urlStore} holds URLs for ${stored.category}. Delete it or pass --category=${stored.category}.`,
    );
  }
  const store = stored ?? emptyUrlStore(config.categoryUrl);

  const persist = createSerialRunner();
  const save = () =>
    persist(() => {
      store.updatedAt = new Date().toISOString();
      return writeJsonAtomic(PATHS.urlStore, store);
    });

  const completed = new Set(store.completedPages);
  const pageIndexes = Array.from({ length: config.maxPages }, (_, i) => i).filter((i) => !completed.has(i));

  log(`Category: ${config.categoryUrl}`);
  log(`Starting with ${store.urls.length} URLs (target ${config.target}), ${config.concurrency} pages at a time`);

  await runPool(
    pageIndexes,
    config.concurrency,
    async (pageIndex) => {
      if (store.urls.length >= config.target) return;
      if (store.totalPages !== null && pageIndex >= store.totalPages) return;

      const pageUrl = listingPageUrl(config.categoryUrl, pageIndex);
      try {
        const result = await withRetry(
          () => fetchListingPage(client, pageUrl, { navigationTimeoutMs: DEFAULTS.navigationTimeoutMs }),
          {
            attempts: config.attempts,
            delayMs: DEFAULTS.retryDelayMs,
            onRetry: ({ attempt, attempts, error }) =>
              log(`page ${pageIndex + 1} attempt ${attempt}/${attempts} failed: ${describeError(error)}`),
          },
        );

        if (result.totalPages) store.totalPages = result.totalPages;
        const added = addUniqueUrls(store, result.urls);
        store.completedPages.push(pageIndex);
        store.failedPages = store.failedPages.filter((f) => f.page !== pageIndex);
        log(
          `page ${pageIndex + 1}${store.totalPages ? `/${store.totalPages}` : ''}: ` +
            `${result.urls.length} links, ${added} new, ${store.urls.length} total`,
        );
      } catch (err) {
        store.failedPages.push({ page: pageIndex, url: pageUrl, error: describeError(err), at: new Date().toISOString() });
        log(`page ${pageIndex + 1} FAILED after ${config.attempts} attempts: ${describeError(err)}`);
      }
      await save();
    },
    {
      shouldStop: () => store.urls.length >= config.target,
      onError: (err) => log(`unexpected error: ${describeError(err)}`),
    },
  );

  await save();
  log(`Saved ${store.urls.length} unique product URLs to ${PATHS.urlStore}`);
  if (store.failedPages.length > 0) {
    log(`${store.failedPages.length} listing page(s) failed; re-run the command to retry them.`);
  }
  if (store.urls.length < config.target) {
    log(`Target of ${config.target} not reached. Raise --max-pages or re-run to resume.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`discover failed: ${describeError(err)}`);
  process.exitCode = 1;
});
