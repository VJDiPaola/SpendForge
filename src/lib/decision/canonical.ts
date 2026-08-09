import { createHash } from "node:crypto";

import {
  modelPurchaseProposalSchema,
  purchaseDecisionInputSchema,
  type ModelPurchaseProposal,
  type PurchaseDecisionInput,
} from "./contracts";

type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | CanonicalJson[]
  | { [key: string]: CanonicalJson };

function canonicalize(value: unknown): CanonicalJson {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Decision inputs cannot contain non-finite numbers");
    }
    return value;
  }

  if (Array.isArray(value)) return value.map(canonicalize);

  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("Decision inputs must contain plain JSON values");
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

export function canonicalDecisionInput(
  input: PurchaseDecisionInput,
): string {
  const parsed = purchaseDecisionInputSchema.parse(input);
  return JSON.stringify(canonicalize(parsed));
}

export function digestDecisionInput(input: PurchaseDecisionInput): string {
  return `sha256:${createHash("sha256")
    .update(canonicalDecisionInput(input), "utf8")
    .digest("hex")}`;
}

export function digestDecisionOutput(
  proposal: ModelPurchaseProposal,
): string {
  const parsed = modelPurchaseProposalSchema.parse(proposal);
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalize(parsed)), "utf8")
    .digest("hex")}`;
}

export function maskOpenAIResponseId(responseId: string): string {
  if (responseId.length === 0 || responseId.length > 512) {
    throw new Error("OpenAI response reference is invalid");
  }

  return `openai-response:sha256:${createHash("sha256")
    .update(responseId, "utf8")
    .digest("hex")
    .slice(0, 16)}`;
}
