import { assertOnPage, withArchonumPage } from './archonum-session.js';
import { waitForBotWallToClear } from './bot-wall.js';
import { acceptCookieConsent } from './cookies.js';
import { buildProductRecord, cleanText, parseEuroPrice, parseProductId } from './product-parser.js';
import { productKeyFromUrl, variantIdFromUrl } from './url-utils.js';

/** Text of the first match, or null. Checks existence first so missing optional fields don't wait for a timeout. */
async function textOf(locator) {
  if ((await locator.count()) === 0) return null;
  return cleanText(await locator.first().textContent());
}

/** Text of every match, skipping empty ones. Does not wait. */
async function textsOf(locator) {
  return (await locator.allTextContents()).map(cleanText).filter(Boolean);
}

async function attributeOf(locator, name) {
  const values = [];
  const count = await locator.count();
  for (let i = 0; i < count; i += 1) {
    const value = await locator.nth(i).getAttribute(name);
    if (value) values.push(value);
  }
  return values;
}

/**
 * Waits until an element matching `selector` is rendered. Uses getClientRects
 * instead of Playwright's visible state, which needs Element.checkVisibility
 * (Chrome 105+). The gateway browsers can be older than that.
 */
async function waitForRendered(page, selector, timeout = 10_000) {
  await page.waitForFunction(
    (sel) => [...document.querySelectorAll(sel)].some((el) => el.getClientRects().length > 0),
    selector,
    { timeout },
  );
}

/** Reads the "Especificaciones" sheet: groups of name/value rows. */
async function readSpecifications(page) {
  await page.locator('#product-info-specifications').click();
  await waitForRendered(page, '.specifications__block');

  const groups = [];
  const blocks = page.locator('.specifications__block');
  const count = await blocks.count();
  for (let i = 0; i < count; i += 1) {
    const block = blocks.nth(i);
    const names = await textsOf(block.locator('dt'));
    const values = await textsOf(block.locator('dd'));
    groups.push({
      group: await textOf(block.locator('h4')),
      items: names.map((name, index) => ({ name, value: values[index] ?? null })),
    });
  }
  await closeSheet(page);
  return groups;
}

/** Reads the "Uso y cuidado" sheet as plain text. Returns null if the sheet doesn't open. */
async function readCareAndUse(page) {
  const trigger = page.getByRole('button', { name: 'Uso y cuidado', exact: true });
  if ((await trigger.count()) === 0) return null;
  await trigger.click();
  await waitForRendered(page, '.sheet-modal__body').catch(() => {});
  // Bulk read of the one rendered sheet body; see the evaluate exception in CLAUDE.md.
  const text = await page.evaluate(() => {
    const body = [...document.querySelectorAll('.sheet-modal__body')].find((el) => el.getClientRects().length > 0);
    return body ? body.innerText : null;
  });
  await closeSheet(page);
  return cleanText(text);
}

async function closeSheet(page) {
  const close = page.getByRole('button', { name: /^Cerrar/ }).first();
  if ((await close.count()) > 0) await close.click().catch(() => {});
}

/**
 * Colour tiles are radio inputs named "colour-<id>" inside the Color fieldset.
 * aria-label reads "Variant: <colour>". Single-colour products have no tiles,
 * so this returns an empty list for them.
 */
async function readColors(page) {
  const inputs = page.locator('input[name^="colour-"]');
  const colors = [];
  for (let i = 0; i < (await inputs.count()); i += 1) {
    const input = inputs.nth(i);
    const label = (await input.getAttribute('aria-label')) ?? '';
    colors.push({
      name: cleanText(label.replace(/^Variant:\s*/i, '')),
      selected: (await input.getAttribute('aria-checked')) === 'true',
      available: (await input.getAttribute('aria-disabled')) !== 'true',
    });
  }
  return colors;
}

/** Reads every visible field of the product page. */
async function scrapeProductFields(page) {
  const buyBox = page.locator('.product-info');
  const priceSection = page.locator('.buy-box__section--price');

  const priceText = await textOf(priceSection.locator('.vp-price-amount'));
  const sectionText = (await textOf(priceSection)) ?? '';
  const originalMatch = /(?:Precio anterior|PVPR|Antes)\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*€/.exec(sectionText);

  const sizeOptions = page.locator('.variant-selector [role="option"]');

  const delivery = [];
  const deliveryOptions = page.locator('.product-fulfilment-option');
  for (let i = 0; i < (await deliveryOptions.count()); i += 1) {
    const option = deliveryOptions.nth(i);
    delivery.push({
      method: await textOf(option.locator('.product-fulfilment-option__headline')),
      status: await textOf(option.locator('.availability-indicator__label')),
    });
  }

  const assurances = [];
  const assuranceItems = page.locator('.product-assurance-item-wrapper');
  for (let i = 0; i < (await assuranceItems.count()); i += 1) {
    const item = assuranceItems.nth(i);
    assurances.push({
      title: await textOf(item.locator('.link__label')),
      description: await textOf(item.locator('.product-assurance-item-wrapper__description')),
    });
  }

  const features = [];
  const featureCards = page.locator('.benefit-card');
  for (let i = 0; i < (await featureCards.count()); i += 1) {
    const card = featureCards.nth(i);
    features.push({
      title: await textOf(card.locator('.benefit-card__title')),
      text: await textOf(card.locator('.benefit-card__subtitle')),
    });
  }

  return {
    name: (await textOf(buyBox.locator('h1'))) ?? (await textOf(page.locator('h1'))),
    brand: await textOf(buyBox.locator('.product-info__brand')),
    description: await textOf(buyBox.locator('.product-info__description')),
    productId: parseProductId(await textOf(buyBox.locator('.product-info__product-id'))),
    stickers: await textsOf(buyBox.locator('.product-info__sticker')),
    breadcrumbs: await textsOf(page.locator('nav[aria-label="Breadcrumb"] a')),
    price: parseEuroPrice(priceText),
    originalPrice: originalMatch ? parseEuroPrice(`${originalMatch[1]} €`) : null,
    financing: await textOf(priceSection.locator('.financing-copy button')),
    sizes: await attributeOf(sizeOptions, 'data-display-value'),
    colors: await readColors(page),
    delivery,
    soldBy: await textOf(page.locator('.sold-and-shipped-by-decathlon--container')),
    assurances,
    features,
    images: await attributeOf(page.locator('.product-gallery__media img'), 'src'),
  };
}

/**
 * Visits one product page in a new Archonum session and returns the full
 * product record: everything the page shows, including the specifications and
 * care sheets. Throws when the essentials are missing so the caller retries.
 */
export async function fetchProductPage(client, productUrl, { sourceCategory, navigationTimeoutMs }) {
  return withArchonumPage(client, async (page) => {
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: navigationTimeoutMs });
    assertOnPage(page, productUrl);
    await waitForBotWallToClear(page);
    assertOnPage(page, productUrl);
    await acceptCookieConsent(page);
    await page.locator('.product-info__name h1, h1').first().waitFor({ state: 'attached', timeout: 60_000 });

    const fields = await scrapeProductFields(page);
    const specifications = await readSpecifications(page).catch(() => []);
    const careAndUse = await readCareAndUse(page).catch(() => null);
    // Last check: a takeover during the clicks above would mean this data belongs to another product.
    assertOnPage(page, productUrl);

    return buildProductRecord({
      ...fields,
      specifications,
      careAndUse,
      url: productUrl,
      productKey: productKeyFromUrl(productUrl),
      variantId: variantIdFromUrl(productUrl),
      sourceCategory,
      scrapedAt: new Date().toISOString(),
    });
  });
}
