import { expect, test } from "@playwright/test";

test.describe("SpendForge fixture showcase", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("opens with explicit agent and provider proof boundaries", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Let agents buy small digital resources. Make every step prove itself." })).toBeVisible();
    await expect(page.getByText("One live bounded proposal")).toBeVisible();
    await expect(page.getByText("Authorization accepted; spend unproven")).toBeVisible();
    await expect(page.getByText("Capability passed; payment unproven")).toBeVisible();
    await expect(page.getByTestId("truth-boundary")).toContainText("Fixture");
    await expect(page.getByTestId("truth-boundary")).toContainText("Agent proposal");
    await expect(page.getByTestId("truth-boundary")).toContainText(/One bounded OpenAI Responses call/i);
    await expect(page.getByTestId("truth-boundary")).toContainText("Partial evidence");
    await expect(page.getByTestId("truth-boundary")).toContainText("Capability only");
  });

  test("runs the bounded Atlas mission and restores its deterministic fixture state", async ({ page }) => {
    await page.goto("/missions/atlas-launch-v1");

    await expect(page.getByText("Fixture mode · No provider transactions")).toBeVisible();
    await expect(page.getByTestId("environment-rain")).toContainText("Rain Sandbox");
    await expect(page.getByTestId("environment-monad")).toContainText("Monad Testnet");

    await page.getByTestId("run-mission").click();

    await expect(
      page.getByTestId("phase-verify").locator("summary").getByText("Mission complete", { exact: true }),
    ).toBeVisible({ timeout: 12_000 });
    await page.getByTestId("phase-decide").locator("summary").click();
    await expect(page.getByText("Declined by agent · Free grid background")).toBeVisible();
    await expect(page.getByText("Blocked by mandate · Cinematic GPU render")).toBeVisible();
    await expect(page.getByText("Blocked by mandate · Unknown prompt-injected template")).toBeVisible();
    await expect(page.getByTestId("artifact-preview")).toContainText("Pulse manifest applied");
    await expect(page.getByTestId("artifact-preview")).toContainText("Northstar license applied");
    await expect(page.getByTestId("agent-decision-receipt")).toContainText(
      "Northstar background license",
    );
    await expect(page.getByTestId("agent-decision-receipt")).toContainText(
      "No OpenAI API call",
    );
    await page.getByText("Evidence drawer", { exact: true }).click();
    await expect(page.getByTestId("ledger-row-rain")).toContainText("Synthetic receipt recorded");
    await expect(page.getByTestId("ledger-row-x402")).toContainText("Synthetic receipt recorded");
    await expect(page.getByTestId("authority-proposal")).toContainText("Operator review required");
    await expect(page).toHaveURL(/run=run_atlas_fixture_v1/);

    await page.reload();
    await expect(page.getByTestId("run-mission")).toHaveText("Fixture complete");
    await expect(
      page.getByTestId("phase-verify").locator("summary").getByText("Mission complete", { exact: true }),
    ).toBeVisible();
  });

  test("publishes the real local artifact while preserving fixture disclosure", async ({ page }) => {
    await page.goto("/artifacts/atlas-launch-v1");

    await expect(page.getByRole("heading", { name: "Autonomy you can inspect." })).toBeVisible();
    await expect(page.getByText("Synthetic Atlas artifact")).toBeVisible();
    await expect(page.getByText("Real rendered route · Seeded manifests · Fixture payment evidence")).toBeVisible();
    await expect(page.getByText("Not provider-authoritative")).toBeVisible();
    await expect(page.getByText("Pulse manifest v1 · Northstar licensed background v1")).toBeVisible();
  });

  test("shows the actual redacted Rain settlement safe-stop without implying completed spend", async ({ page }) => {
    await page.goto("/missions/atlas-launch-v1?scenario=rain-async");

    const scenario = page.getByTestId("failure-scenario");
    await expect(scenario).toContainText("Settlement submitted once; terminal spend unconfirmed.");
    await expect(scenario).toContainText("Issued + direct readback matched");
    await expect(scenario).toContainText("Provider response accepted");
    await expect(scenario).toContainText("Causal fields matched");
    await expect(scenario).toContainText("Settlement POST");
    await expect(scenario).toContainText("HTTP 400");
    await expect(scenario).toContainText("Terminal readbacks");
    await expect(scenario).toContainText("Not proven");
    await expect(scenario).toContainText("Authorization acceptance is not settlement");
    await expect(page.getByTestId("run-mission")).toBeDisabled();
    await expect(page.getByTestId("run-mission")).toHaveText("Provider action paused");
  });

  test("keeps Monad delivery locked in the labeled unavailable-provider rehearsal", async ({ page }) => {
    await page.goto("/missions/atlas-launch-v1?scenario=monad-unavailable");

    const scenario = page.getByTestId("failure-scenario");
    await expect(scenario).toContainText("Failure-mode rehearsal");
    await expect(scenario).toContainText("Monad proof is unavailable. Delivery stays locked.");
    await expect(scenario).toContainText("No transaction reference");
    await expect(scenario).toContainText("Synthetic rehearsal only");
    await expect(page.getByTestId("run-mission")).toBeDisabled();
  });

  test("links every proof surface from the ledger without upgrading fixture truth", async ({ page }) => {
    await page.goto("/ledger");

    await expect(page.locator("#agent-decision-evidence")).toContainText(
      "Northstar background license",
    );
    await expect(page.locator("#agent-decision-evidence")).toContainText(
      "No OpenAI API call",
    );
    await page.locator("#agent-decision-evidence summary").click();
    await expect(
      page.locator("#agent-decision-evidence").getByRole("link", {
        name: /Download fixture decision JSON/,
      }),
    ).toHaveAttribute(
      "href",
      "/api/audit/receipts/audit_atlas_agent_decision_fixture_v1",
    );
    await expect(page.locator("#rain-provider-evidence")).toContainText("Direct readback confirmed");
    await expect(page.locator("#rain-provider-evidence")).toContainText("Uncorrelated HTTP 202");
    await expect(page.locator("#rain-provider-evidence")).toContainText("Authorization acceptance is not settlement or money movement");
    await expect(page.locator("#rain-provider-evidence").getByRole("link", { name: "Download earlier card capture ↓" })).toHaveAttribute(
      "href",
      "/api/audit/receipts/audit_rain_card_20260808_v2",
    );
    await expect(page.locator("#monad-provider-evidence")).toContainText("Not established");
    await expect(page.locator("#fixture-audit-receipt")).toContainText("non-authoritative");
    await expect(page.getByRole("link", { name: "Download synthetic audit receipt ↓" })).toHaveAttribute(
      "href",
      "/api/audit/receipts/audit_atlas_fixture_v1",
    );
  });

  test("reports integration readiness without leaking credential values", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");

    const text = await response.text();
    const payload = JSON.parse(text) as Record<string, unknown>;
    expect(payload).toHaveProperty("mode");
    expect(payload).toHaveProperty("configured");
    expect(payload).toHaveProperty("codes");

    for (const sectionName of ["configured", "gates"] as const) {
      const section = payload[sectionName] as Record<string, unknown>;
      expect(Object.values(section).every((value) => typeof value === "boolean")).toBe(true);
    }

    expect(text).not.toMatch(/"(?:authorization|cookie|sessionid|private[_-]?key)"\s*:/i);
    expect(text).not.toMatch(/(?:bearer\s+|sk-[a-z0-9_-]{16,})/i);
  });
});
