import type { Metadata } from "next";

import { MissionControl } from "@/components/mission-control";
import { PlatformShell } from "@/components/platform-shell";
import {
  buildAtlasFixtureDecisionAudit,
  buildAtlasFixtureRun,
} from "@/lib/demo";

export const metadata: Metadata = {
  title: "Atlas mission",
  description: "A bounded agentic procurement mission across Rain and Monad boundaries.",
};

type MissionPageProps = {
  searchParams: Promise<{ run?: string; scenario?: string }>;
};

export default async function MissionPage({ searchParams }: MissionPageProps) {
  const query = await searchParams;
  const fixtureRun = buildAtlasFixtureRun();
  const initialRun = query.run === fixtureRun.id ? fixtureRun : undefined;
  const initialAgentDecision = initialRun
    ? await buildAtlasFixtureDecisionAudit()
    : undefined;
  const presentationScenario =
    query.scenario === "rain-async" || query.scenario === "monad-unavailable"
      ? query.scenario
      : "fixture";

  return (
    <PlatformShell>
      <MissionControl
        initialAgentDecision={initialAgentDecision}
        initialRun={initialRun}
        presentationScenario={presentationScenario}
        template={fixtureRun}
      />
    </PlatformShell>
  );
}
