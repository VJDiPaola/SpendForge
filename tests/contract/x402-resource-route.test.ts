import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { NextRequest } from "next/server";

import { GET } from "@/app/api/resources/pulse/route";

describe("protected Pulse x402 seller resource", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fails closed without Preview attempt/recovery configuration and calls no provider", async () => {
    vi.stubEnv("MONAD_X402_AUTHORIZED_ATTEMPT_ID", "");
    vi.stubEnv("RECOVERY_ENCRYPTION_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await GET(
      new NextRequest("https://preview.invalid/api/resources/pulse"),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "X402_RESOURCE_UNAVAILABLE" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
