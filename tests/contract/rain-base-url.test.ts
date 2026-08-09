import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { inspectServerEnvironment, parseServerEnv } from "@/lib/env";
import {
  RAIN_SANDBOX_BASE_URL,
  rainSandboxBaseUrlSchema,
} from "@/lib/integrations/rain";

describe("Rain sandbox base URL allowlist", () => {
  it("accepts only the exact HTTPS /v1 base and normalizes one trailing slash", () => {
    expect(rainSandboxBaseUrlSchema.parse(RAIN_SANDBOX_BASE_URL)).toBe(
      RAIN_SANDBOX_BASE_URL,
    );
    expect(
      rainSandboxBaseUrlSchema.parse(`${RAIN_SANDBOX_BASE_URL}/`),
    ).toBe(RAIN_SANDBOX_BASE_URL);
    expect(
      parseServerEnv({ RAIN_BASE_URL: `${RAIN_SANDBOX_BASE_URL}/` })
        .RAIN_BASE_URL,
    ).toBe(RAIN_SANDBOX_BASE_URL);
  });

  it.each([
    "http://api-dev.raincards.xyz/v1",
    "https://api-dev.raincards.xyz.evil.example/v1",
    "https://api-dev.raincards.xyz:443/v1",
    "https://user@api-dev.raincards.xyz/v1",
    "https://api-dev.raincards.xyz/v1//",
    "https://api-dev.raincards.xyz/v1/extra",
    "https://api-dev.raincards.xyz/v1?next=https://evil.example",
    "https://api-dev.raincards.xyz/v1#fragment",
  ])("rejects non-allowlisted variant %s", (baseUrl) => {
    expect(() => rainSandboxBaseUrlSchema.parse(baseUrl)).toThrow(
      /Rain sandbox base URL is not allowlisted/,
    );
  });

  it("makes an unsafe environment invalid without returning its value", () => {
    const unsafeBaseUrl =
      "https://api-dev.raincards.xyz.evil.example/v1";
    const inspection = inspectServerEnvironment({
      DEMO_MODE: "live",
      RAIN_BASE_URL: unsafeBaseUrl,
      RAIN_API_KEY: "sandbox-secret-never-returned",
      RAIN_USER_ID: "sandbox-user",
      RAIN_CONTRACT_ID: "sandbox-contract",
      RAIN_MUTATIONS_ENABLED: "true",
    });

    expect(inspection.valid).toBe(false);
    expect(inspection.configured.rain).toBe(false);
    expect(inspection.gates.rainProvider).toBe(false);
    expect(JSON.stringify(inspection)).not.toContain(unsafeBaseUrl);
  });
});
