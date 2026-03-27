/**
 * Smoke tests — verify the app launches and basic navigation works.
 *
 * These tests use a clean, isolated database so they start from the
 * onboarding / empty state.
 */

import {
  waitForAppReady,
  navigateTo,
  takeScreenshot,
  dismissOnboardingIfPresent,
} from "../helpers/app.js";
import { assertVisible, assertNotVisible } from "../helpers/assertions.js";
import { selectors } from "../helpers/selectors.js";

describe("Smoke: app launch", () => {
  before(async () => {
    await waitForAppReady();
    await dismissOnboardingIfPresent();
  });

  afterEach(async function () {
    if (this.currentTest?.state === "failed") {
      const name = (this.currentTest.title ?? "unknown").replace(/\s+/g, "_");
      await takeScreenshot(`FAIL-${name}`);
    }
  });

  it("renders the sidebar with navigation items", async () => {
    await assertVisible(selectors.sidebar, "Sidebar");
    await assertVisible(selectors.navHome, "Home nav button");
    await assertVisible(selectors.navTasks, "Tasks nav button");
    await assertVisible(selectors.navRepos, "Repos nav button");
  });

  it("shows the dispatch board on Home view", async () => {
    await navigateTo("home");
    await assertVisible(selectors.dispatchBoard, "Dispatch board");
  });

  it("navigates to the Repos view", async () => {
    await navigateTo("repos");
    // The repos page should be visible — verify by checking main content area
    const main = await $("main");
    expect(await main.isDisplayed()).toBe(true);
  });

  it("navigates to the Tasks view", async () => {
    await navigateTo("tasks");
    const main = await $("main");
    expect(await main.isDisplayed()).toBe(true);
  });

  it("can return to Home after navigating away", async () => {
    await navigateTo("repos");
    await navigateTo("home");
    await assertVisible(selectors.dispatchBoard, "Dispatch board after nav");
  });
});

describe("Smoke: settings modal", () => {
  before(async () => {
    await waitForAppReady();
    await dismissOnboardingIfPresent();
    await navigateTo("home");
  });

  afterEach(async function () {
    if (this.currentTest?.state === "failed") {
      const name = (this.currentTest.title ?? "unknown").replace(/\s+/g, "_");
      await takeScreenshot(`FAIL-${name}`);
    }
    // Ensure modal is closed between tests
    await browser.keys("Escape");
    await browser.pause(200);
  });

  it("opens settings via the sidebar button", async () => {
    const btn = await $(selectors.settingsButton);
    await btn.click();
    await browser.pause(400);
    await assertVisible(selectors.settingsModal, "Settings modal");
  });

  it("closes settings with Escape", async () => {
    const btn = await $(selectors.settingsButton);
    await btn.click();
    await browser.pause(400);
    await assertVisible(selectors.settingsModal, "Settings modal");

    await browser.keys("Escape");
    await browser.pause(300);
    await assertNotVisible(selectors.settingsModal, "Settings modal after Escape");
  });
});
