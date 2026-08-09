import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GET } from "@/app/api/health/route";
import { inspectServerEnvironment } from "@/lib/env";
import { getIntegrationHealth } from "@/lib/integrations/health";

describe("server environment and safe health contract", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats an empty environment as an explicitly labeled fixture", () => {
    const health = getIntegrationHealth({});

    expect(health).toEqual({
      ok: true,
      mode: "fixture",
      configured: {
        rain: false,
        monadX402: false,
        database: false,
        decisionModel: false,
        decisionProof: false,
        openaiApiKey: false,
        openaiProvider: false,
        recoveryEncryption: false,
        rainProofAttempt: false,
        rainReconciliationAttempt: false,
      },
      gates: {
        rainProvider: false,
        rainFunding: false,
        rainCardIssuance: false,
        monadPayment: false,
        monadSeller: false,
        openaiDecision: false,
        openaiProofWindow: false,
        rainAuthorization: false,
        rainSettlement: false,
        rainNorthstarWindow: false,
        rainReconciliationWindow: false,
      },
      missingIntegrations: [],
      codes: ["FIXTURE_MODE"],
    });
  });

  it("reports live configuration presence without ever returning values", () => {
    const rainSecret = "rain-secret-that-must-never-be-returned";
    const walletSecret = `0x${"1".repeat(64)}`;
    const source = {
      DEMO_MODE: "live",
      DATABASE_URL:
        "postgresql://spendforge_runtime:masked@demo.invalid/spendforge",
      RECOVERY_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString("base64"),
      VERCEL_AUTOMATION_BYPASS_SECRET: "fake-preview-bypass-never-used",
      MODEL_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test-configured-but-not-called",
      RAIN_API_KEY: rainSecret,
      RAIN_USER_ID: "user-fixture",
      RAIN_CONTRACT_ID: "contract-fixture",
      MONAD_X402_BUYER_PRIVATE_KEY: walletSecret,
      MONAD_X402_SELLER_ADDRESS: `0x${"2".repeat(40)}`,
      MONAD_X402_RESOURCE_URL: "https://supplier.example/x402/resource",
      MONAD_X402_AUTHORIZED_ATTEMPT_ID: "atlas-monad-attempt-v1",
      MONAD_X402_MAX_AMOUNT_ATOMIC: "3000",
    };

    const inspection = inspectServerEnvironment(source);
    const health = getIntegrationHealth(source);
    const serialized = JSON.stringify(health);

    expect(inspection.configured).toEqual({
      rain: true,
      monadX402: true,
      database: true,
      decisionModel: true,
      decisionProof: false,
      openaiApiKey: true,
      openaiProvider: true,
      recoveryEncryption: true,
      rainProofAttempt: false,
      rainReconciliationAttempt: false,
    });
    expect(health.ok).toBe(false);
    expect(health.missingIntegrations).toEqual([]);
    expect(health.gates).toEqual({
      rainProvider: false,
      rainFunding: false,
      rainCardIssuance: false,
      monadPayment: false,
      monadSeller: false,
      openaiDecision: false,
      openaiProofWindow: false,
      rainAuthorization: false,
      rainSettlement: false,
      rainNorthstarWindow: false,
      rainReconciliationWindow: false,
    });
    expect(health.codes).toEqual([
      "MUTATION_GATES_CLOSED",
      "MODEL_EXECUTION_GATE_CLOSED",
      "PROVIDER_PROOF_UNCONFIRMED",
    ]);
    expect(serialized).not.toContain(rainSecret);
    expect(serialized).not.toContain(walletSecret);
  });

  it("does not require a static session id or team id for direct Rain readback", () => {
    const inspection = inspectServerEnvironment({
      RAIN_API_KEY: "sandbox-key",
      RAIN_USER_ID: "sandbox-user",
      RAIN_CONTRACT_ID: "sandbox-contract",
    });

    expect(inspection.configured.rain).toBe(true);
  });

  it("collapses invalid environment details into one safe code", () => {
    const invalidSecret = "not-a-valid-private-key-and-never-public";
    const health = getIntegrationHealth({
      DEMO_MODE: "live",
      MONAD_X402_BUYER_PRIVATE_KEY: invalidSecret,
    });

    expect(health.ok).toBe(false);
    expect(health.codes).toEqual(["ENVIRONMENT_INVALID"]);
    expect(JSON.stringify(health)).not.toContain(invalidSecret);
  });

  it("does not call an arbitrary URL a configured operation database", () => {
    const health = getIntegrationHealth({
      DEMO_MODE: "live",
      DATABASE_URL: "https://database.example/not-postgres",
    });

    expect(health.ok).toBe(false);
    expect(health.configured.database).toBe(false);
    expect(health.codes).toEqual(["ENVIRONMENT_INVALID"]);
  });

  it("serves a no-store, read-only response without provider calls", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = GET();
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Object.keys(body).sort()).toEqual(
      ["codes", "configured", "gates", "missingIntegrations", "mode", "ok"].sort(),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
