import { z } from "zod";

export const RAIN_SANDBOX_BASE_URL =
  "https://api-dev.raincards.xyz/v1" as const;

/**
 * Rain credentials may only be sent to the workshop sandbox origin and base
 * path. One optional trailing slash is accepted and normalized away.
 */
export const rainSandboxBaseUrlSchema = z
  .string()
  .trim()
  .url()
  .transform((value, context) => {
    const valid =
      value === RAIN_SANDBOX_BASE_URL ||
      value === `${RAIN_SANDBOX_BASE_URL}/`;

    if (!valid) {
      context.addIssue({
        code: "custom",
        message: "Rain sandbox base URL is not allowlisted",
      });
      return z.NEVER;
    }

    return RAIN_SANDBOX_BASE_URL;
  });

export type RainSandboxBaseUrl = z.infer<
  typeof rainSandboxBaseUrlSchema
>;
