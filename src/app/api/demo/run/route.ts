import "server-only";

import { z } from "zod";

import {
  buildAtlasFixtureDecisionAudit,
  buildAtlasFixtureRun,
  type AtlasFixtureRunEnvelope,
} from "@/lib/demo";

const requestSchema = z.object({
  missionId: z.literal("mission_atlas_launch_v1"),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_FIXTURE_MISSION", message: "Only the Atlas fixture mission is available." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const envelope: AtlasFixtureRunEnvelope = {
    run: buildAtlasFixtureRun(),
    agentDecision: await buildAtlasFixtureDecisionAudit(),
    truthBoundary: "fixture-only",
  };

  return Response.json(envelope, {
    status: 201,
    headers: {
      "Cache-Control": "no-store",
      "X-SpendForge-Mode": "fixture",
      "X-SpendForge-Decision-Mode": "deterministic-fixture",
    },
  });
}
