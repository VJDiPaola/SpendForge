import type {
  DemoParityQuote,
  Money,
  NormalizedBudgetAmount,
} from "./types";

const ATOMIC_AMOUNT_PATTERN = /^(0|[1-9]\d*)$/;

function pow10(exponent: number): bigint {
  if (!Number.isSafeInteger(exponent) || exponent < 0) {
    throw new Error(`Invalid decimal exponent: ${exponent}`);
  }

  return BigInt(10) ** BigInt(exponent);
}

function atomic(value: string, fieldName = "amount"): bigint {
  if (typeof value !== "string" || !ATOMIC_AMOUNT_PATTERN.test(value)) {
    throw new Error(`${fieldName} must be an unsigned canonical integer string`);
  }

  return BigInt(value);
}

function canonical(value: bigint): string {
  if (value < BigInt(0)) {
    throw new Error("Money amounts cannot be negative");
  }

  return value.toString(10);
}

function assertDecimals(decimals: number): void {
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error("Money decimals must be an integer from 0 through 18");
  }
}

export function createMoney(input: Money): Money {
  assertDecimals(input.decimals);
  const amount = canonical(atomic(input.amount));

  return {
    amount,
    decimals: input.decimals,
    asset: input.asset,
    ...(input.network ? { network: input.network } : {}),
  };
}

function assertSameDenomination(left: Money, right: Money): void {
  if (
    left.asset !== right.asset ||
    left.decimals !== right.decimals ||
    left.network !== right.network
  ) {
    throw new Error(
      "Cross-asset, cross-network, or cross-decimal arithmetic requires an explicit conversion",
    );
  }
}

export function addMoney(left: Money, right: Money): Money {
  assertSameDenomination(left, right);

  return createMoney({
    ...left,
    amount: canonical(atomic(left.amount) + atomic(right.amount)),
  });
}

export function compareMoney(left: Money, right: Money): -1 | 0 | 1 {
  assertSameDenomination(left, right);
  const leftAmount = atomic(left.amount);
  const rightAmount = atomic(right.amount);

  if (leftAmount < rightAmount) return -1;
  if (leftAmount > rightAmount) return 1;
  return 0;
}

function rescaleExact(
  amount: bigint,
  sourceDecimals: number,
  targetDecimals: number,
): bigint {
  assertDecimals(sourceDecimals);
  assertDecimals(targetDecimals);

  if (sourceDecimals === targetDecimals) return amount;
  if (sourceDecimals < targetDecimals) {
    return amount * pow10(targetDecimals - sourceDecimals);
  }

  const divisor = pow10(sourceDecimals - targetDecimals);
  if (amount % divisor !== BigInt(0)) {
    throw new Error("Conversion would require rounding atomic money");
  }

  return amount / divisor;
}

export function normalizeForDemoBudget(
  input: Money,
  quote: DemoParityQuote,
): NormalizedBudgetAmount {
  const money = createMoney(input);
  const accountingDecimals = quote.accountingDecimals;
  assertDecimals(accountingDecimals);

  if (money.asset === quote.quoteAsset) {
    return {
      amount: canonical(
        rescaleExact(atomic(money.amount), money.decimals, accountingDecimals),
      ),
      decimals: accountingDecimals,
      unit: "DEMO_USD",
      quoteId: quote.id,
    };
  }

  if (money.asset !== quote.baseAsset) {
    throw new Error(
      `The demo parity quote cannot normalize asset ${money.asset}`,
    );
  }

  if (money.decimals !== quote.baseDecimals) {
    throw new Error("USDC amount decimals do not match the explicit parity quote");
  }

  const numerator =
    atomic(money.amount) *
    atomic(quote.quoteAtomicAmount, "quoteAtomicAmount") *
    pow10(accountingDecimals - quote.quoteDecimals);
  const denominator = atomic(quote.baseAtomicAmount, "baseAtomicAmount");

  if (numerator % denominator !== BigInt(0)) {
    throw new Error("Parity conversion would require rounding atomic money");
  }

  return {
    amount: canonical(numerator / denominator),
    decimals: accountingDecimals,
    unit: "DEMO_USD",
    quoteId: quote.id,
  };
}

function assertSameBudgetUnit(
  left: NormalizedBudgetAmount,
  right: NormalizedBudgetAmount,
): void {
  if (
    left.unit !== right.unit ||
    left.decimals !== right.decimals ||
    left.quoteId !== right.quoteId
  ) {
    throw new Error("Normalized budget amounts must use the same explicit quote");
  }
}

export function addBudgetAmounts(
  left: NormalizedBudgetAmount,
  right: NormalizedBudgetAmount,
): NormalizedBudgetAmount {
  assertSameBudgetUnit(left, right);

  return {
    ...left,
    amount: canonical(atomic(left.amount) + atomic(right.amount)),
  };
}

export function compareBudgetAmounts(
  left: NormalizedBudgetAmount,
  right: NormalizedBudgetAmount,
): -1 | 0 | 1 {
  assertSameBudgetUnit(left, right);
  const leftAmount = atomic(left.amount);
  const rightAmount = atomic(right.amount);

  if (leftAmount < rightAmount) return -1;
  if (leftAmount > rightAmount) return 1;
  return 0;
}

export function zeroBudgetAmount(
  quote: DemoParityQuote,
): NormalizedBudgetAmount {
  return {
    amount: "0",
    decimals: quote.accountingDecimals,
    unit: "DEMO_USD",
    quoteId: quote.id,
  };
}

export function formatMoney(input: Money): string {
  const money = createMoney(input);
  const padded = money.amount.padStart(money.decimals + 1, "0");
  const integerPart =
    money.decimals === 0 ? padded : padded.slice(0, -money.decimals);
  const rawFraction =
    money.decimals === 0 ? "" : padded.slice(-money.decimals);
  const fraction =
    money.asset === "USD" || money.asset === "rUSD"
      ? rawFraction
      : rawFraction.replace(/0+$/, "");
  const decimal = fraction.length > 0 ? `${integerPart}.${fraction}` : integerPart;

  if (money.asset === "USD") return `$${decimal}`;
  return `${decimal} ${money.asset}`;
}
