import "server-only";

import type { AppMode } from "@/lib/env";
import { parseServerEnv } from "@/lib/env";
import type { RainGateway } from "@/lib/integrations/rain/contracts";
import { createFixtureRainGateway } from "@/lib/integrations/rain/fixture";
import { createLiveRainGateway } from "@/lib/integrations/rain/live";
import { UnavailableRainGateway } from "@/lib/integrations/rain/unavailable";

export * from "@/lib/integrations/rain/contracts";
export {
  RAIN_SANDBOX_BASE_URL,
  rainSandboxBaseUrlSchema,
} from "@/lib/integrations/rain/base-url";
export {
  createFixtureRainGateway,
  FixtureRainGateway,
} from "@/lib/integrations/rain/fixture";
export { UnavailableRainGateway } from "@/lib/integrations/rain/unavailable";
export { RainProviderError } from "@/lib/integrations/rain/errors";
export {
  createLiveRainGateway,
  LiveRainGateway,
} from "@/lib/integrations/rain/live";
export {
  RAIN_SANDBOX_SESSION_PUBLIC_KEY,
  generateRainSessionId,
} from "@/lib/integrations/rain/session";

export function createRainGateway(
  mode: AppMode,
  source: Record<string, string | undefined> = process.env,
): RainGateway {
  if (mode === "fixture") {
    return createFixtureRainGateway();
  }
  if (mode === "live") {
    const environment = parseServerEnv(source);
    return createLiveRainGateway(environment);
  }
  return new UnavailableRainGateway();
}
