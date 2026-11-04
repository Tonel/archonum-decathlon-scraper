/**
 * Pure helpers that turn the raw text scraped from a product page into typed
 * values. No browser or network access here, so the logic can be checked
 * without a live session.
 */

/** "1.299,00 €" -> { amount: 1299, currency: "EUR" }. Returns null when no price is found. */
export function parseEuroPrice(text) {
  const match = /(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})\s*€/.exec(text ?? '');
  if (!match) return null;
  const amount = Number(`${match[1].replace(/\./g, '')}.${match[2]}`);
  return Number.isFinite(amount) ? { amount, currency: 'EUR' } : null;
}

/** Plain value from "ID 9030752" style labels. */
export function parseProductId(text) {
  const match = /ID\s*(\d+)/.exec(text ?? '');
  return match ? match[1] : null;
}

/** Trims text and collapses whitespace. Empty strings become null. */
export function cleanText(text) {
  const value = (text ?? '').replace(/\s+/g, ' ').trim();
  return value === '' ? null : value;
}

/**
 * Builds the stored product record from values scraped by the product page.
 * Throws when the essentials are missing, so incomplete pages are retried
 * instead of saved.
 */
export function buildProductRecord(raw) {
  const name = cleanText(raw.name);
  if (!name) throw new Error('Product name is missing');
  if (!raw.price) throw new Error('Product price is missing');

  return {
    url: raw.url,
    productKey: raw.productKey,
    variantId: raw.variantId,
    productId: raw.productId ?? null,
    name,
    brand: cleanText(raw.brand),
    description: cleanText(raw.description),
    stickers: raw.stickers ?? [],
    breadcrumbs: raw.breadcrumbs ?? [],
    price: raw.price,
    originalPrice: raw.originalPrice ?? null,
    financing: cleanText(raw.financing),
    sizes: raw.sizes ?? [],
    colors: raw.colors ?? [],
    delivery: raw.delivery ?? [],
    soldBy: cleanText(raw.soldBy),
    assurances: raw.assurances ?? [],
    features: raw.features ?? [],
    specifications: raw.specifications ?? [],
    careAndUse: cleanText(raw.careAndUse),
    images: raw.images ?? [],
    sourceCategory: raw.sourceCategory,
    scrapedAt: raw.scrapedAt,
  };
}
