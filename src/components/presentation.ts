import type { Money } from "@/lib/domain/types";

export function formatMoneyAtomic(money: Money) {
  const digits = money.amount.padStart(money.decimals + 1, "0");
  const split = digits.length - money.decimals;
  const whole = digits.slice(0, split);
  const fraction = money.decimals ? digits.slice(split).replace(/0+$/, "") : "";
  const value = fraction ? `${whole}.${fraction}` : whole;
  const prefix = money.asset === "USD" || money.asset === "rUSD" ? "$" : "";
  const suffix = money.asset === "USDC" ? " test USDC" : "";
  return `${prefix}${value}${suffix}`;
}

export function shortReference(value: string | undefined) {
  if (!value) return "Not issued";
  if (value.length <= 20) return value;
  return `${value.slice(0, 10)}…${value.slice(-7)}`;
}
