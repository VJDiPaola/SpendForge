import "server-only";

import { IntegrationUnavailableError } from "@/lib/integrations/errors";
import type {
  RainAuthorizeInput,
  RainFundInput,
  RainGateway,
  RainReadbackInput,
  RainScopedCardInput,
  RainSettleInput,
} from "@/lib/integrations/rain/contracts";

export class UnavailableRainGateway implements RainGateway {
  private unavailable(): never {
    throw new IntegrationUnavailableError("LIVE_PROVIDER_UNAVAILABLE");
  }

  async fundCollateral(input: RainFundInput): Promise<never> {
    void input;
    return this.unavailable();
  }

  async issueScopedCard(input: RainScopedCardInput): Promise<never> {
    void input;
    return this.unavailable();
  }

  async authorize(input: RainAuthorizeInput): Promise<never> {
    void input;
    return this.unavailable();
  }

  async settle(input: RainSettleInput): Promise<never> {
    void input;
    return this.unavailable();
  }

  async readback(input: RainReadbackInput): Promise<never> {
    void input;
    return this.unavailable();
  }
}
