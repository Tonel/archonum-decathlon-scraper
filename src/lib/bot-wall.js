const CHALLENGE_TITLE =
  /just a moment|un momento|attention required|verifying/i;
const CHALLENGE_SELECTOR =
  '#challenge-form, #challenge-stage, iframe[src*="challenges.cloudflare.com"]';

/**
 * Waits until a Cloudflare-style verification page gives way to the real page.
 * Throws if it is still there after `timeoutMs`; the caller's retry then opens
 * a new session, which gets a new device.
 */
export async function waitForBotWallToClear(page, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const title = await page.title().catch(() => "");
    const challengeVisible =
      (await page
        .locator(CHALLENGE_SELECTOR)
        .count()
        .catch(() => 0)) > 0;
    if (!CHALLENGE_TITLE.test(title) && !challengeVisible) return;
    if (Date.now() >= deadline) {
      throw new Error(
        `still on bot-wall challenge page after ${timeoutMs / 1000}s (title: "${title}")`,
      );
    }
    await page.waitForTimeout(2_000);
  }
}
