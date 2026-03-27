/**
 * App lifecycle helpers for E2E tests.
 *
 * These functions handle waiting for the app to be ready, navigating between
 * views, and capturing diagnostic screenshots.
 */

import { selectors } from "./selectors.js";

/** Wait for the React app to mount by checking for the sidebar. */
export async function waitForAppReady(timeoutMs = 30_000): Promise<void> {
  await browser.waitUntil(
    async () => {
      const sidebar = await $(selectors.sidebar);
      return sidebar.isDisplayed();
    },
    {
      timeout: timeoutMs,
      timeoutMsg: `App did not render within ${timeoutMs / 1000}s. The Tauri backend may have failed to start or the React app did not mount.`,
    },
  );
}

/**
 * Click a sidebar navigation button by data-testid.
 *
 * Waits briefly for the view transition to settle.
 */
export async function navigateTo(
  view: "home" | "tasks" | "repos",
): Promise<void> {
  const selectorMap = {
    home: selectors.navHome,
    tasks: selectors.navTasks,
    repos: selectors.navRepos,
  } as const;

  const btn = await $(selectorMap[view]);
  await btn.waitForClickable({ timeout: 5000 });
  await btn.click();
  // Allow view transition
  await browser.pause(400);
}

/**
 * Save a screenshot to e2e/screenshots/.
 *
 * The filename includes a timestamp to avoid collisions.
 */
export async function takeScreenshot(name: string): Promise<string> {
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `e2e/screenshots/${safeName}-${Date.now()}.png`;
  await browser.saveScreenshot(filename);
  return filename;
}

/**
 * Get the visible text of an element, waiting for it to appear first.
 */
export async function getVisibleText(selector: string): Promise<string> {
  const el = await $(selector);
  await el.waitForDisplayed({ timeout: 5000 });
  return el.getText();
}

/**
 * Dismiss the onboarding dialog if it is visible.
 *
 * Some tests may launch the app for the first time (clean DB) and the
 * onboarding dialog will block interaction.  This helper safely dismisses it.
 */
export async function dismissOnboardingIfPresent(): Promise<void> {
  try {
    const dialog = await $(selectors.onboardingDialog);
    const visible = await dialog.isDisplayed();
    if (visible) {
      await browser.keys("Escape");
      await browser.pause(300);
    }
  } catch {
    // Not present — nothing to do
  }
}
