import { merchantCategoryCode, merchantName } from "./constants";
import type { ParsedSpendReadback } from "./schemas";

export function classifySpendAmount(
  amount: ParsedSpendReadback["spend"]["amount"],
): "documented-minor-units" | "observed-major-units" | "mismatch" {
  const canonical = typeof amount === "number" ? String(amount) : amount;
  if (canonical === "12") return "documented-minor-units";
  if (canonical === "0.12") return "observed-major-units";
  return "mismatch";
}

export function evaluateExactSpend(input: {
  payload: ParsedSpendReadback;
  transactionId: string;
  cardId: string;
  userId: string;
}) {
  const { payload, transactionId, cardId, userId } = input;
  const amountEncoding = classifySpendAmount(payload.spend.amount);
  const merchantNormalized =
    payload.spend.merchantName.trim().toLocaleLowerCase("en-US") ===
    merchantName.toLocaleLowerCase("en-US");
  const currencyExact = payload.spend.currency === "USD";
  const currencyNormalized = payload.spend.currency.trim().toUpperCase() === "USD";
  const matchCodes = [
    ...(payload.id === transactionId ? ["TRANSACTION_ID_MATCH"] : []),
    ...(payload.type === "spend" ? ["TRANSACTION_TYPE_SPEND_MATCH"] : []),
    ...(payload.spend.cardId === cardId ? ["CARD_ID_MATCH"] : []),
    ...(payload.spend.userId === userId ? ["USER_ID_MATCH"] : []),
    ...(amountEncoding === "documented-minor-units"
      ? ["AMOUNT_12_USD_CENTS_MATCH"]
      : amountEncoding === "observed-major-units"
        ? ["AMOUNT_0_12_USD_OBSERVED_API_DRIFT"]
        : []),
    ...(currencyExact
      ? ["CURRENCY_USD_MATCH"]
      : currencyNormalized
        ? ["CURRENCY_USD_CASE_VARIANT"]
        : []),
    ...(merchantNormalized ? ["MERCHANT_MATCH"] : []),
    ...(payload.spend.merchantCategoryCode === merchantCategoryCode
      ? ["MCC_5734_MATCH"]
      : []),
    ...(payload.spend.cardType === "virtual" ? ["CARD_TYPE_VIRTUAL"] : []),
  ];
  const requiredCodes = [
    "TRANSACTION_ID_MATCH",
    "TRANSACTION_TYPE_SPEND_MATCH",
    "CARD_ID_MATCH",
    "USER_ID_MATCH",
    "MCC_5734_MATCH",
    "CARD_TYPE_VIRTUAL",
  ];
  return {
    amountEncoding,
    matchCodes,
    matchesAllCausalFields:
      amountEncoding !== "mismatch" &&
      merchantNormalized &&
      currencyNormalized &&
      requiredCodes.every((code) => matchCodes.includes(code)),
  } as const;
}

export function requireExactSpend(input: {
  payload: ParsedSpendReadback;
  transactionId: string;
  cardId: string;
  userId: string;
}) {
  return evaluateExactSpend(input).matchesAllCausalFields;
}
