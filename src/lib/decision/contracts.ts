import { z } from "zod";

const boundedIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, "Identifier contains unsafe characters");

const boundedSummarySchema = z.string().trim().min(1).max(600);

const uniqueIdsSchema = z
  .array(boundedIdSchema)
  .max(32)
  .refine((values) => new Set(values).size === values.length, {
    message: "Identifiers must be unique",
  });

export const decisionActionSchema = z.enum([
  "APPROVE",
  "REJECT",
  "NEEDS_REVIEW",
]);
export type DecisionAction = z.infer<typeof decisionActionSchema>;

export const decisionPolicyRiskSchema = z.enum([
  "NONE",
  "OVER_BUDGET",
  "VENDOR_DISALLOWED",
  "MCC_DISALLOWED",
  "PROVIDER_AMBIGUOUS",
  "DUPLICATE_ATTEMPT",
  "MISSING_EVIDENCE",
  "PROMPT_INJECTION",
  "LOW_CONFIDENCE",
  "CATALOG_MISMATCH",
]);
export type DecisionPolicyRisk = z.infer<typeof decisionPolicyRiskSchema>;

export const decisionResourceTypeSchema = z.enum([
  "data",
  "component",
  "media",
  "compute",
  "service",
  "product",
]);

export const decisionPaymentRailSchema = z.enum([
  "FREE",
  "RAIN_CARD",
  "MONAD_X402",
]);

export const decisionProviderStateSchema = z.enum([
  "READY",
  "AMBIGUOUS",
  "UNAVAILABLE",
]);

export const decisionAttemptStateSchema = z.enum([
  "NONE",
  "IN_FLIGHT",
  "TERMINAL",
  "AMBIGUOUS",
]);

export const decisionSecuritySignalSchema = z.enum([
  "PROMPT_INJECTION",
  "CREDENTIAL_REQUEST",
  "UNTRUSTED_EXECUTABLE",
]);

export const decisionEvidenceStateSchema = z.enum([
  "AVAILABLE",
  "MISSING",
  "AMBIGUOUS",
]);

export const purchaseDecisionInputSchema = z
  .object({
    mission: z
      .object({
        id: boundedIdSchema,
        objective: z.string().trim().min(1).max(1_500),
        totalBudgetCents: z.number().int().nonnegative().max(10_000_000),
        perPurchaseCapCents: z.number().int().nonnegative().max(10_000_000),
        remainingBudgetCents: z.number().int().nonnegative().max(10_000_000),
        allowedResourceTypes: z
          .array(decisionResourceTypeSchema)
          .min(1)
          .max(6),
        allowedVendorIds: uniqueIdsSchema,
        allowedMerchantCategoryCodes: z
          .array(z.string().regex(/^\d{4}$/))
          .max(32)
          .refine((values) => new Set(values).size === values.length, {
            message: "Merchant category codes must be unique",
          }),
        requiredEvidenceIds: uniqueIdsSchema,
        deadline: z.string().datetime({ offset: true }),
      })
      .strict(),
    catalog: z
      .array(
        z
          .object({
            resourceId: boundedIdSchema,
            title: z.string().trim().min(1).max(160),
            description: z.string().trim().min(1).max(1_500),
            vendorId: boundedIdSchema,
            merchantCategoryCode: z.string().regex(/^\d{4}$/).nullable(),
            resourceType: decisionResourceTypeSchema,
            paymentRail: decisionPaymentRailSchema,
            quotedPriceCents: z.number().int().nonnegative().max(10_000_000),
            active: z.boolean(),
            provenance: z.enum(["SEEDED", "SIGNED", "VERIFIED"]),
            evidenceIds: uniqueIdsSchema,
            securitySignals: z
              .array(decisionSecuritySignalSchema)
              .max(3)
              .refine((values) => new Set(values).size === values.length, {
                message: "Security signals must be unique",
              }),
            providerState: decisionProviderStateSchema,
            attemptState: decisionAttemptStateSchema,
          })
          .strict(),
      )
      .min(1)
      .max(20),
    priorEvidence: z
      .array(
        z
          .object({
            evidenceId: boundedIdSchema,
            state: decisionEvidenceStateSchema,
            summary: z.string().trim().min(1).max(300),
          })
          .strict(),
      )
      .max(64),
    now: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.mission.remainingBudgetCents > input.mission.totalBudgetCents) {
      context.addIssue({
        code: "custom",
        path: ["mission", "remainingBudgetCents"],
        message: "Remaining budget cannot exceed total budget",
      });
    }

    if (
      input.mission.perPurchaseCapCents > input.mission.totalBudgetCents
    ) {
      context.addIssue({
        code: "custom",
        path: ["mission", "perPurchaseCapCents"],
        message: "Per-purchase cap cannot exceed total budget",
      });
    }

    const resourceIds = input.catalog.map((resource) => resource.resourceId);
    if (new Set(resourceIds).size !== resourceIds.length) {
      context.addIssue({
        code: "custom",
        path: ["catalog"],
        message: "Catalog resource IDs must be unique",
      });
    }

    const evidenceIds = input.priorEvidence.map(
      (evidence) => evidence.evidenceId,
    );
    if (new Set(evidenceIds).size !== evidenceIds.length) {
      context.addIssue({
        code: "custom",
        path: ["priorEvidence"],
        message: "Prior evidence IDs must be unique",
      });
    }
  });
export type PurchaseDecisionInput = z.infer<
  typeof purchaseDecisionInputSchema
>;

export const modelPurchaseProposalSchema = z
  .object({
    action: decisionActionSchema,
    selectedResourceId: boundedIdSchema.nullable(),
    maximumAuthorizedCents: z
      .number()
      .int()
      .nonnegative()
      .max(10_000_000),
    rationale: boundedSummarySchema,
    evidenceIds: uniqueIdsSchema,
    policyRisks: z
      .array(decisionPolicyRiskSchema)
      .min(1)
      .max(10)
      .refine((values) => new Set(values).size === values.length, {
        message: "Policy risks must be unique",
      }),
    confidenceBps: z.number().int().min(0).max(10_000),
  })
  .strict()
  .superRefine((proposal, context) => {
    if (
      proposal.policyRisks.includes("NONE") &&
      proposal.policyRisks.length !== 1
    ) {
      context.addIssue({
        code: "custom",
        path: ["policyRisks"],
        message: "NONE cannot be combined with another policy risk",
      });
    }

    if (
      proposal.action === "APPROVE" &&
      proposal.selectedResourceId === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["selectedResourceId"],
        message: "An approved proposal must select a catalog resource",
      });
    }

    if (
      proposal.action !== "APPROVE" &&
      proposal.maximumAuthorizedCents !== 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["maximumAuthorizedCents"],
        message: "A rejected or review proposal cannot authorize spend",
      });
    }
  });
export type ModelPurchaseProposal = z.infer<
  typeof modelPurchaseProposalSchema
>;

export const decisionPolicyRuleSchema = z.enum([
  "POLICY_OK",
  "MODEL_REJECTED",
  "MODEL_REQUESTED_REVIEW",
  "RESOURCE_NOT_SELECTED",
  "RESOURCE_NOT_IN_CATALOG",
  "RESOURCE_INACTIVE",
  "RESOURCE_TYPE_DISALLOWED",
  "VENDOR_DISALLOWED",
  "MCC_MISSING",
  "MCC_DISALLOWED",
  "PER_PURCHASE_CAP_EXCEEDED",
  "TOTAL_BUDGET_EXCEEDED",
  "MODEL_MAXIMUM_EXCEEDS_CAP",
  "MODEL_MAXIMUM_BELOW_QUOTE",
  "MANDATE_EXPIRED",
  "PROVIDER_STATE_AMBIGUOUS",
  "PROVIDER_UNAVAILABLE",
  "DUPLICATE_ATTEMPT",
  "AMBIGUOUS_PRIOR_ATTEMPT",
  "MISSING_EVIDENCE",
  "UNKNOWN_EVIDENCE_REFERENCE",
  "PROMPT_INJECTION_DETECTED",
  "CREDENTIAL_REQUEST_DETECTED",
  "UNTRUSTED_EXECUTABLE",
  "LOW_CONFIDENCE",
]);
export type DecisionPolicyRule = z.infer<typeof decisionPolicyRuleSchema>;

export const verifiedPurchaseDecisionSchema = z
  .object({
    finalAction: decisionActionSchema,
    selectedResourceId: boundedIdSchema.nullable(),
    verifiedMaximumAuthorizedCents: z
      .number()
      .int()
      .nonnegative()
      .max(10_000_000),
    eligibleForExecution: z.boolean(),
    ruleCodes: z.array(decisionPolicyRuleSchema).min(1).max(32),
    modelActionOverridden: z.boolean(),
  })
  .strict();
export type VerifiedPurchaseDecision = z.infer<
  typeof verifiedPurchaseDecisionSchema
>;

export const auditedPurchaseDecisionSchema = z
  .object({
    schemaVersion: z.literal(1),
    modelId: z.string().trim().min(1).max(128),
    promptVersion: z.string().trim().min(1).max(128),
    inputDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    outputDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    startedAt: z.string().datetime({ offset: true }),
    completedAt: z.string().datetime({ offset: true }),
    executionMode: z.enum(["fixture", "openai-live"]),
    evidenceMode: z.enum(["fixture", "openai-structured-output"]),
    providerResponseReference: z
      .string()
      .regex(/^openai-response:sha256:[0-9a-f]{16}$/)
      .nullable(),
    usage: z
      .object({
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        totalTokens: z.number().int().nonnegative(),
      })
      .strict()
      .nullable(),
    proposal: modelPurchaseProposalSchema,
    policyVerification: verifiedPurchaseDecisionSchema,
    truthState: z.enum([
      "FIXTURE_PROPOSAL_VERIFIED",
      "OPENAI_PROPOSAL_VERIFIED",
      "OPENAI_PROPOSAL_REJECTED_BY_POLICY",
      "OPENAI_PROPOSAL_NEEDS_REVIEW",
    ]),
  })
  .strict()
  .superRefine((decision, context) => {
    if (Date.parse(decision.completedAt) < Date.parse(decision.startedAt)) {
      context.addIssue({
        code: "custom",
        path: ["completedAt"],
        message: "Decision completion cannot precede its start",
      });
    }
    if (
      decision.usage &&
      decision.usage.totalTokens !==
        decision.usage.inputTokens + decision.usage.outputTokens
    ) {
      context.addIssue({
        code: "custom",
        path: ["usage", "totalTokens"],
        message: "Decision token usage must be internally consistent",
      });
    }
  });
export type AuditedPurchaseDecision = z.infer<
  typeof auditedPurchaseDecisionSchema
>;

export interface DecisionModel {
  decide(input: PurchaseDecisionInput): Promise<AuditedPurchaseDecision>;
}

/**
 * Strict Responses API schema. Runtime validation remains mandatory because
 * schema-conforming model output is still only a proposal.
 */
export const OPENAI_PURCHASE_PROPOSAL_JSON_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["APPROVE", "REJECT", "NEEDS_REVIEW"] },
    selectedResourceId: { type: ["string", "null"] },
    maximumAuthorizedCents: {
      type: "integer",
      minimum: 0,
      maximum: 10_000_000,
    },
    rationale: { type: "string" },
    evidenceIds: {
      type: "array",
      items: { type: "string" },
    },
    policyRisks: {
      type: "array",
      items: {
        type: "string",
        enum: decisionPolicyRiskSchema.options,
      },
    },
    confidenceBps: {
      type: "integer",
      minimum: 0,
      maximum: 10_000,
    },
  },
  required: [
    "action",
    "selectedResourceId",
    "maximumAuthorizedCents",
    "rationale",
    "evidenceIds",
    "policyRisks",
    "confidenceBps",
  ],
  additionalProperties: false,
} as const;
