/**
 * Accepts the GDPR consent banner if it shows up. Returns true when the banner
 * was dismissed, false when no banner appeared (the page is then usable as-is).
 * `timeout` is how long to wait for the banner; 0 checks once and does not wait.
 */
export async function acceptCookieConsent(page, timeout = 8_000) {
  const accept = page.getByRole('button', { name: 'Aceptar', exact: true }).first();
  if (timeout > 0) {
    try {
      await accept.waitFor({ state: 'attached', timeout });
    } catch {
      return false; // No banner on this page.
    }
  } else if ((await accept.count()) === 0) {
    return false;
  }
  try {
    await accept.click({ timeout: Math.max(timeout, 5_000) });
    return true;
  } catch {
    // Playwright's click can depend on browser APIs that the gateway's older
    // Chrome lacks. Fall back to a plain DOM click on the same button.
    return page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === 'Aceptar');
      if (!button) return false;
      button.click();
      return true;
    });
  }
}
