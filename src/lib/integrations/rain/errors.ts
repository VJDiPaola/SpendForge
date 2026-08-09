import type { IntegrationErrorCode } from "@/lib/integrations/errors";

export type RainOperationStage =
  | "fund_collateral"
  | "issue_scoped_card"
  | "authorize"
  | "settle"
  | "readback";

export class RainProviderError extends Error {
  readonly retryable = false;

  constructor(
    readonly code: Extract<
      IntegrationErrorCode,
      | "RAIN_CONFIGURATION_MISSING"
      | "RAIN_PROVIDER_HTTP_ERROR"
      | "RAIN_PROVIDER_SCHEMA_MISMATCH"
      | "RAIN_PROVIDER_AMBIGUOUS_WRITE"
      | "RAIN_PROVIDER_INCOMPLETE"
      | "RAIN_PROVIDER_IDENTITY_MISMATCH"
      | "RAIN_LEGACY_PROOF_RETIRED"
    >,
    readonly stage: RainOperationStage,
    readonly status?: number,
  ) {
    super(status ? `${code}:${stage}:HTTP_${status}` : `${code}:${stage}`);
    this.name = "RainProviderError";
  }
}
