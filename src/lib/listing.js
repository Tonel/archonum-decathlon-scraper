import { PAGE_SIZE } from "../config.js";
import { withArchonumPage } from "./archonum-session.js";
import { acceptCookieConsent } from "./cookies.js";
import { normalizeProductUrl, parsePaginationInfo } from "./url-utils.js";
import { waitForBotWallToClear } from "./bot-wall.js";

/** A middle page with fewer product links than this was not fully rendered. */
export const MIN_PRODUCTS_PER_PAGE = 30;

/**
 * Loads one category listing page in a new Archonum session and returns the
 * unique product URLs on it plus the pagination totals. Throws when the grid
 * is missing or incomplete, so the caller's retry logic can take over.
 */
export async function fetchListingPage(
  client,
  pageUrl,
  { navigationTimeoutMs },
) {
  return withArchonumPage(client, async (page) => {
    await page.goto(pageUrl, {
      waitUntil: "domcontentloaded",
      timeout: navigationTimeoutMs,
    });
    await waitForBotWallToClear(page);
    // No wait for the banner: product links are read from the DOM, so an overlay doesn't block the read.
    await acceptCookieConsent(page, 0);

    // Same check as the browser console: every product link on the rendered page.
    // The "/p/" match is broad on purpose (any country's locale); the URL rules below keep only products.
    await page.waitForFunction(
      () => document.querySelectorAll('a[href*="/p/"]').length > 0,
      null,
      {
        timeout: 5_000,
      },
    );
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll('a[href*="/p/"]')].map((e) => e.href),
    );
    const siteOrigin = new URL(pageUrl).origin;
    const urls = [
      ...new Set(
        hrefs.map((href) => normalizeProductUrl(href, siteOrigin)).filter(Boolean),
      ),
    ];

    // Check for the label first: reading a missing element would wait for the full default timeout.
    const paginationInfo = page.locator(".pagination__page-info").first();
    const paginationText =
      (await paginationInfo.count()) > 0
        ? await paginationInfo.textContent()
        : null;
    const pagination = parsePaginationInfo(paginationText);

    const isLastPage =
      pagination.totalPages !== null &&
      pagination.currentPage >= pagination.totalPages;
    if (!isLastPage && urls.length < MIN_PRODUCTS_PER_PAGE) {
      throw new Error(
        `incomplete listing: ${urls.length} product links on a full page (expected about ${PAGE_SIZE})`,
      );
    }

    return { urls, ...pagination };
  });
}
