#!/usr/bin/env node
/**
 * Step 2: visits every product URL from data/product-urls.json and writes one
 * JSON file per product into products/<productId>_<variant>.json.
 *
 *   npm run scrape -- [--concurrency=20] [--limit=N] [--force] [--attempts=5]
 *
 * Products already saved are skipped unless --force is given, so re-running
 * after a partial failure only fetches what is still missing. Failures are
 * listed in data/failed-products.json.
 */
import { access } from 'node:fs/promises';
import path from 'node:path';
import { withRetry } from '@archonum/sdk';
import { DEFAULTS, PATHS, resolveConfig } from './config.js';
import { fetchProductPage } from './lib/product-page.js';
import { runPool } from './lib/pool.js';
import { createArchonumClient, describeError, installPlaywrightGuard, log } from './lib/runtime.js';
import { readJsonIfExists, writeJsonAtomic } from './lib/store.js';
import { productKeyFromUrl, variantIdFromUrl } from './lib/url-utils.js';

const productFile = (url) => path.join(PATHS.productsDir, `${productKeyFromUrl(url)}.json`);

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  installPlaywrightGuard();
  const config = resolveConfig({ defaultConcurrency: DEFAULTS.concurrency.scrape });
  const client = createArchonumClient();

  const store = await readJsonIfExists(PATHS.urlStore);
  if (!store) {
    throw new Error(`${PATHS.urlStore} not found. Run "npm run discover" first.`);
  }

  const urls = store.urls.slice(0, config.limit);
  const pending = [];
  for (const url of urls) {
    if (config.force || !(await exists(productFile(url)))) pending.push(url);
  }
  const skipped = urls.length - pending.length;

  log(`${urls.length} URLs in list, ${skipped} already saved, ${pending.length} to scrape (concurrency ${config.concurrency})`);

  const failures = [];
  let saved = 0;

  await runPool(
    pending,
    config.concurrency,
    async (url) => {
      try {
        const record = await withRetry(
          () =>
            fetchProductPage(client, url, {
              sourceCategory: store.category,
              navigationTimeoutMs: DEFAULTS.navigationTimeoutMs,
            }),
          {
            attempts: config.attempts,
            delayMs: DEFAULTS.retryDelayMs,
            onRetry: ({ attempt, attempts, error }) =>
              log(`${variantIdFromUrl(url)} attempt ${attempt}/${attempts} failed: ${describeError(error)}`),
          },
        );
        await writeJsonAtomic(productFile(url), record);
        saved += 1;
        log(`[${saved + failures.length}/${pending.length}] ${record.variantId} ${record.name} — ${record.price.amount} ${record.price.currency ?? ''}`.trimEnd());
      } catch (err) {
        failures.push({ url, error: describeError(err), at: new Date().toISOString() });
        log(`[${saved + failures.length}/${pending.length}] FAILED ${url}: ${describeError(err)}`);
      }
    },
    { onError: (err) => log(`unexpected error: ${describeError(err)}`) },
  );

  await writeJsonAtomic(PATHS.failedProducts, { updatedAt: new Date().toISOString(), failures });
  log(`Done. saved=${saved} skipped=${skipped} failed=${failures.length}`);
  if (failures.length > 0) {
    log(`Failures listed in ${PATHS.failedProducts}; re-run "npm run scrape" to retry them.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`scrape failed: ${describeError(err)}`);
  process.exitCode = 1;
});
