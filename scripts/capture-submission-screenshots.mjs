import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3101";
const outputDirectory = resolve("docs", "screenshots");

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
  colorScheme: "light",
});
const page = await context.newPage();

async function capture(fileName, path) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
  await page.screenshot({
    path: resolve(outputDirectory, fileName),
    animations: "disabled",
  });
}

async function captureAround(fileName, path, selector, topOffset = 120) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
  await page.locator(selector).evaluate((element, offset) => {
    const targetTop = element.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, targetTop), behavior: "auto" });
  }, topOffset);
  await page.screenshot({
    path: resolve(outputDirectory, fileName),
    animations: "disabled",
  });
}

try {
  await capture("01-proof-posture.png", "/");
  await capture("02-mission-ready.png", "/missions/atlas-launch-v1");

  await page.getByTestId("run-mission").click();
  await page
    .getByTestId("phase-verify")
    .locator("summary")
    .getByText("Mission complete", { exact: true })
    .waitFor({ state: "visible", timeout: 12_000 });
  await page.getByTestId("phase-decide").locator("summary").click();
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  await page.screenshot({
    path: resolve(outputDirectory, "03-decision-complete.png"),
    animations: "disabled",
  });

  await capture(
    "04-rain-authorization-safe-stop.png",
    "/missions/atlas-launch-v1?scenario=rain-async",
  );
  await captureAround(
    "05-rain-partial-proof.png",
    "/ledger",
    "#rain-provider-evidence",
    120,
  );
  await capture(
    "06-monad-unavailable.png",
    "/missions/atlas-launch-v1?scenario=monad-unavailable",
  );
  await capture("07-ledger-overview.png", "/ledger");
  await capture("08-atlas-artifact.png", "/artifacts/atlas-launch-v1");
  await captureAround(
    "09-approval-inbox.png",
    "/policies",
    '[data-testid="approval-inbox"]',
    130,
  );
} finally {
  await browser.close();
}

console.log(`Captured 9 redacted submission frames in ${outputDirectory}`);
