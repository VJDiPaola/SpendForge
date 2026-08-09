import "server-only";

import { IntegrationUnavailableError } from "@/lib/integrations/errors";
import type {
  X402Gateway,
  X402PayAndFetchInput,
} from "@/lib/integrations/x402/contracts";

export class UnavailableX402Gateway implements X402Gateway {
  private unavailable(): never {
    throw new IntegrationUnavailableError("X402_CONFIGURATION_MISSING");
  }

  async getSupported(): Promise<never> {
    return this.unavailable();
  }

  async payAndFetch<T>(input: X402PayAndFetchInput<T>): Promise<never> {
    void input;
    return this.unavailable();
  }
}
