import "server-only";

import { buildAtlasFixtureRun } from "@/lib/demo";

type RunRouteProps = {
  params: Promise<{ runId: string }>;
};

export async function GET(_request: Request, { params }: RunRouteProps) {
  const { runId } = await params;
  const run = buildAtlasFixtureRun();

  if (runId !== run.id) {
    return Response.json(
      { error: "RUN_NOT_FOUND" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(run, {
    headers: {
      "Cache-Control": "no-store",
      "X-SpendForge-Mode": "fixture",
    },
  });
}
