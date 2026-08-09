export const integrationErrorCodeValues = [
  "RAIN_CONFIGURATION_MISSING",
  "RAIN_PROVIDER_HTTP_ERROR",
  "RAIN_PROVIDER_SCHEMA_MISMATCH",
  "RAIN_PROVIDER_AMBIGUOUS_WRITE",
  "RAIN_PROVIDER_INCOMPLETE",
  "RAIN_PROVIDER_IDENTITY_MISMATCH",
  "RAIN_LEGACY_PROOF_RETIRED",
  "X402_CONFIGURATION_MISSING",
  "X402_PACKAGE_UNVERIFIED",
  "LIVE_PROVIDER_UNAVAILABLE",
] as const;

export type IntegrationErrorCode =
  (typeof integrationErrorCodeValues)[number];

/**
 * Deliberately contains no provider body, credential, URL, or request payload.
 * Callers may expose `code`, but must keep the original failure server-side.
 */
export class IntegrationUnavailableError extends Error {
  readonly code: IntegrationErrorCode;
  readonly retryable = false;

  constructor(code: IntegrationErrorCode) {
    super(code);
    this.name = "IntegrationUnavailableError";
    this.code = code;
  }
}
