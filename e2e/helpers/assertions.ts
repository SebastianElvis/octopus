/**
 * Agent-friendly assertion helpers.
 *
 * Every assertion captures a screenshot on failure and produces a detailed
 * error message so that an automated agent (e.g. Claude Code) can diagnose
 * the issue from the test output alone.
 */

import { takeScreenshot } from "./app.js";

/**
 * Assert that an element matching `selector` is visible on screen.
 *
 * On failure: saves a screenshot and throws with the selector, description,
 * and screenshot path included in the message.
 */
export async function assertVisible(
  selector: string,
  description: string,
): Promise<void> {
  const el = await $(selector);
  const visible = await el.isDisplayed().catch(() => false);
  if (!visible) {
    const screenshot = await takeScreenshot(`assert-visible-FAIL`);
    throw new Error(
      [
        `ASSERTION FAILED: expected "${description}" to be visible.`,
        `  selector : ${selector}`,
        `  screenshot: ${screenshot}`,
      ].join("\n"),
    );
  }
}

/**
 * Assert that an element matching `selector` is NOT visible on screen.
 */
export async function assertNotVisible(
  selector: string,
  description: string,
): Promise<void> {
  const el = await $(selector);
  const visible = await el.isDisplayed().catch(() => false);
  if (visible) {
    const screenshot = await takeScreenshot(`assert-not-visible-FAIL`);
    throw new Error(
      [
        `ASSERTION FAILED: expected "${description}" to NOT be visible.`,
        `  selector : ${selector}`,
        `  screenshot: ${screenshot}`,
      ].join("\n"),
    );
  }
}

/**
 * Assert that exactly `expected` elements match `selector`.
 */
export async function assertElementCount(
  selector: string,
  expected: number,
  description: string,
): Promise<void> {
  const elements = await $$(selector);
  if (elements.length !== expected) {
    const screenshot = await takeScreenshot(`assert-count-FAIL`);
    throw new Error(
      [
        `ASSERTION FAILED: expected ${expected} "${description}" elements, found ${elements.length}.`,
        `  selector : ${selector}`,
        `  screenshot: ${screenshot}`,
      ].join("\n"),
    );
  }
}

/**
 * Assert that an element's text contains the expected substring.
 */
export async function assertTextContains(
  selector: string,
  expected: string,
  description: string,
): Promise<void> {
  const el = await $(selector);
  await el.waitForDisplayed({ timeout: 5000 });
  const text = await el.getText();
  if (!text.includes(expected)) {
    const screenshot = await takeScreenshot(`assert-text-FAIL`);
    throw new Error(
      [
        `ASSERTION FAILED: expected "${description}" text to contain "${expected}".`,
        `  actual text: "${text}"`,
        `  selector   : ${selector}`,
        `  screenshot : ${screenshot}`,
      ].join("\n"),
    );
  }
}
