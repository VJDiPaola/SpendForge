import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { POST } from "@/app/api/demo/run/route";

describe("Atlas fixture run route", () => {
  it("records a deterministic agent proposal without any provider or model call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await POST(
      new Request("https://spendforge.example/api/demo/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ missionId: "mission_atlas_launch_v1" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get("x-spendforge-mode")).toBe("fixture");
    expect(response.headers.get("x-spendforge-decision-mode")).toBe(
      "deterministic-fixture",
    );
    expect(body).toMatchObject({
      truthBoundary: "fixture-only",
      run: {
        id: "run_atlas_fixture_v1",
        executionMode: "fixture",
      },
      agentDecision: {
        executionMode: "fixture",
        providerResponseReference: null,
        truthState: "FIXTURE_PROPOSAL_VERIFIED",
        policyVerification: {
          finalAction: "APPROVE",
          verifiedMaximumAuthorizedCents: 12,
        },
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects any mission outside the fixed fixture", async () => {
    const response = await POST(
      new Request("https://spendforge.example/api/demo/run", {
        method: "POST",
        body: JSON.stringify({ missionId: "mission_unknown" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "INVALID_FIXTURE_MISSION",
      message: "Only the Atlas fixture mission is available.",
    });
  });
});
