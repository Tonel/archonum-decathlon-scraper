import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export const DEFAULT_CATEGORY_URL = "https://www.decathlon.es/es/deportes/futbol/botas";

/**
 * Decathlon country sites: decathlon.es, decathlon.fr, decathlon.co.uk, decathlon.com.br, etc.
 * The host must be one of these, so the scripts can't be pointed at arbitrary sites.
 */
const DECATHLON_HOST = /^(www\.)?decathlon\.([a-z]{2,3}|co\.[a-z]{2}|com\.[a-z]{2})$/i;
/** Decathlon listing pages return 40 items per page via ?from=<offset>&size=40. */
export const PAGE_SIZE = 40;

export const DEFAULTS = Object.freeze({
  /** Pages in flight at once. Discovery overshoots the target by up to (concurrency - 1) pages. */
  concurrency: Object.freeze({ discover: 3, scrape: 20 }),
  target: 1000,
  attempts: 5,
  retryDelayMs: 3000,
  navigationTimeoutMs: 60_000,
  maxPages: 200,
});

export const PATHS = Object.freeze({
  dataDir: path.join(PROJECT_ROOT, "data"),
  urlStore: path.join(PROJECT_ROOT, "data", "product-urls.json"),
  failedProducts: path.join(PROJECT_ROOT, "data", "failed-products.json"),
  productsDir: path.join(PROJECT_ROOT, "products"),
});

/** Parses `--key=value` and bare `--flag` arguments. */
export function parseCliArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const match = /^--([a-z-]+)(?:=(.*))?$/i.exec(arg);
    if (!match)
      throw new Error(
        `Unrecognised argument "${arg}". Use --key=value syntax.`,
      );
    args[match[1]] = match[2] ?? true;
  }
  return args;
}

function toPositiveInt(value, name, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(
      `${name} must be an integer between ${min} and ${max} (got "${value}")`,
    );
  }
  return n;
}

/**
 * Accepts an https category URL on any Decathlon country site. The domain and the
 * language path (for example /es/ or /fr/) come from this URL, so the scripts use
 * the same site and language throughout.
 */
export function validateCategoryUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`category must be a valid URL (got "${value}")`);
  }
  if (url.protocol !== "https:" || !DECATHLON_HOST.test(url.hostname)) {
    throw new Error(
      `category must be an https URL on a Decathlon country site (e.g. decathlon.es, decathlon.fr)`,
    );
  }
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

/**
 * Resolves runtime configuration. CLI flags win over environment variables,
 * which win over the defaults. Each script passes its own default concurrency
 * and the name of its environment variable, so the two scripts don't share one setting.
 */
export function resolveConfig({
  argv = process.argv.slice(2),
  env = process.env,
  defaultConcurrency = DEFAULTS.concurrency.scrape,
  concurrencyEnv = "CONCURRENCY",
} = {}) {
  const args = parseCliArgs(argv);
  return {
    concurrency: toPositiveInt(
      args.concurrency ?? env[concurrencyEnv] ?? defaultConcurrency,
      "concurrency",
      1,
      50,
    ),
    target: toPositiveInt(
      args.target ?? env.TARGET_URLS ?? DEFAULTS.target,
      "target",
      1,
      100_000,
    ),
    limit:
      args.limit === undefined
        ? Infinity
        : toPositiveInt(args.limit, "limit", 1, 1_000_000),
    attempts: toPositiveInt(
      args.attempts ?? env.MAX_ATTEMPTS ?? DEFAULTS.attempts,
      "attempts",
      1,
      10,
    ),
    maxPages: toPositiveInt(
      args["max-pages"] ?? DEFAULTS.maxPages,
      "max-pages",
      1,
      10_000,
    ),
    categoryUrl: validateCategoryUrl(
      args.category ?? env.CATEGORY_URL ?? DEFAULT_CATEGORY_URL,
    ),
    force: args.force === true,
  };
}
