import { describe, expect, it } from "vitest";

import {
  addBudgetAmounts,
  addMoney,
  compareBudgetAmounts,
  createMoney,
  formatMoney,
  normalizeForDemoBudget,
} from "@/lib/domain";
import { ATLAS_DEMO_PARITY_QUOTE } from "@/lib/demo";

describe("atomic money", () => {
  it("adds matching denominations with integer arithmetic", () => {
    expect(
      addMoney(
        { amount: "12", decimals: 2, asset: "USD", network: "rain-sandbox" },
        { amount: "3", decimals: 2, asset: "USD", network: "rain-sandbox" },
      ),
    ).toEqual({
      amount: "15",
      decimals: 2,
      asset: "USD",
      network: "rain-sandbox",
    });
  });

  it("rejects decimal strings and JavaScript number inputs", () => {
    expect(() =>
      createMoney({ amount: "0.12", decimals: 2, asset: "USD" }),
    ).toThrow(/integer string/);
    expect(() =>
      createMoney({
        amount: 12 as unknown as string,
        decimals: 2,
        asset: "USD",
      }),
    ).toThrow(/integer string/);
  });

  it("requires explicit conversion for different assets", () => {
    expect(() =>
      addMoney(
        { amount: "12", decimals: 2, asset: "USD" },
        { amount: "3000", decimals: 6, asset: "USDC" },
      ),
    ).toThrow(/explicit conversion/);
  });

  it("normalizes USD cents and USDC atoms through the disclosed parity quote", () => {
    const northstar = normalizeForDemoBudget(
      { amount: "12", decimals: 2, asset: "USD", network: "rain-sandbox" },
      ATLAS_DEMO_PARITY_QUOTE,
    );
    const pulse = normalizeForDemoBudget(
      {
        amount: "3000",
        decimals: 6,
        asset: "USDC",
        network: "eip155:10143",
      },
      ATLAS_DEMO_PARITY_QUOTE,
    );
    const combined = addBudgetAmounts(northstar, pulse);
    const budget = normalizeForDemoBudget(
      { amount: "25", decimals: 2, asset: "USD", network: "rain-sandbox" },
      ATLAS_DEMO_PARITY_QUOTE,
    );

    expect(northstar.amount).toBe("120000");
    expect(pulse.amount).toBe("3000");
    expect(combined.amount).toBe("123000");
    expect(compareBudgetAmounts(combined, budget)).toBe(-1);
  });

  it("formats atomic values without floating point conversion", () => {
    expect(formatMoney({ amount: "12", decimals: 2, asset: "USD" })).toBe(
      "$0.12",
    );
    expect(
      formatMoney({ amount: "3000", decimals: 6, asset: "USDC" }),
    ).toBe("0.003 USDC");
  });
});
