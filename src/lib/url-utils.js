import { PAGE_SIZE } from '../config.js';

// Decathlon product paths are [/<locale>]/p/<slug>/<productId>/<variant>. The
// locale (es, fr, it, de, ...) is optional, since some country sites omit it.
// Two forms exist: Decathlon's own (numeric id) and marketplace ones (.../p/mp/..., UUID id).
const PRODUCT_PATH = /^(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/p\/(?:mp\/)?([^/]+)\/([^/]+)\/([^/]+)\/?$/i;

/**
 * Returns the canonical product URL for an href on the given site, or null when
 * the href is not a product page of that site. Query strings and fragments are
 * dropped so the same product is never stored twice.
 */
export function normalizeProductUrl(href, siteOrigin) {
  let url;
  try {
    url = new URL(href, siteOrigin);
  } catch {
    return null;
  }
  if (url.origin !== siteOrigin) return null;
  if (!PRODUCT_PATH.test(url.pathname)) return null;
  return `${siteOrigin}${url.pathname.replace(/\/$/, '')}`;
}

function matchProductUrl(productUrl) {
  const match = PRODUCT_PATH.exec(new URL(productUrl).pathname);
  if (!match) throw new Error(`Not a product URL: ${productUrl}`);
  return match;
}

/** Variant code from the product URL, e.g. "m9030752" for .../386707/m9030752. */
export function variantIdFromUrl(productUrl) {
  return matchProductUrl(productUrl)[3];
}

/**
 * Unique, file-name-safe key for a product: "<productId>_<variant>". The variant
 * code alone is not unique (marketplace codes like "c1" repeat across products).
 */
export function productKeyFromUrl(productUrl) {
  const [, , productId, variant] = matchProductUrl(productUrl);
  return `${productId}_${variant}`;
}

/** URL for listing page `pageIndex` (0-based). Page 0 is the bare category URL. */
export function listingPageUrl(categoryUrl, pageIndex) {
  if (pageIndex === 0) return categoryUrl;
  const url = new URL(categoryUrl);
  url.searchParams.set('from', String(pageIndex * PAGE_SIZE));
  url.searchParams.set('size', String(PAGE_SIZE));
  return url.toString();
}

/** Parses the "1 de 147" pagination label into page numbers. */
export function parsePaginationInfo(text) {
  const match = /(\d+)\s+de\s+(\d+)/.exec(text ?? '');
  if (!match) return { currentPage: null, totalPages: null };
  return { currentPage: Number(match[1]), totalPages: Number(match[2]) };
}
