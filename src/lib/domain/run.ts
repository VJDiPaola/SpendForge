import { appendRunEvent, assertCanonicalEventLog } from "./events";
import type {
  DeliveryEvidence,
  ISODateTime,
  MissionRun,
  MissionRunStatus,
} from "./types";

const RUN_STATUS_TRANSITIONS: Record<
  MissionRunStatus,
  readonly MissionRunStatus[]
> = {
  draft: ["planning", "failed"],
  planning: ["policy_checked", "failed"],
  policy_checked: ["purchasing", "failed"],
  purchasing: ["delivering", "reconciliation_required", "failed"],
  delivering: ["composing", "reconciliation_required", "failed"],
  composing: ["evaluating", "failed"],
  evaluating: ["completed", "failed"],
  reconciliation_required: ["purchasing", "delivering", "failed"],
  completed: [],
  failed: [],
};

function isCanonicalIsoDateTime(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function assertSerializableTree(
  value: unknown,
  path = "run",
  ancestors = new Set<object>(),
): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${path} contains a non-finite number`);
    }
    return;
  }
  if (typeof value !== "object") {
    throw new Error(`${path} contains a non-serializable ${typeof value}`);
  }
  if (ancestors.has(value)) {
    throw new Error(`${path} contains a circular reference`);
  }
  if (value instanceof Date) {
    throw new Error(`${path} contains a Date object; use an ISO string`);
  }

  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((child, index) =>
      assertSerializableTree(child, `${path}[${index}]`, ancestors),
    );
  } else {
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new Error(`${path} contains a non-plain object`);
    }
    Object.entries(value).forEach(([key, child]) => {
      if (
        (key.endsWith("At") || key === "deadline" || key === "asOf") &&
        (typeof child !== "string" || !isCanonicalIsoDateTime(child))
      ) {
        throw new Error(`${path}.${key} must be a canonical ISO timestamp string`);
      }
      assertSerializableTree(child, `${path}.${key}`, ancestors);
    });
  }
  ancestors.delete(value);
}

export function transitionRunStatus(
  current: MissionRunStatus,
  next: MissionRunStatus,
): MissionRunStatus {
  if (!RUN_STATUS_TRANSITIONS[current].includes(next)) {
    throw new Error(`Invalid run status transition: ${current} -> ${next}`);
  }
  return next;
}

export function assertMissionRunSerializable(run: MissionRun): void {
  assertSerializableTree(run);
  JSON.stringify(run);
}

export function assertMissionRunInvariants(run: MissionRun): void {
  assertMissionRunSerializable(run);
  assertCanonicalEventLog(run.events, run.id);

  const offerIds = new Set(run.offers.map((offer) => offer.id));
  if (offerIds.size !== run.offers.length) {
    throw new Error("Mission run contains duplicate offer IDs");
  }
  if (run.offerResults.length !== run.offers.length) {
    throw new Error("Every offer must have exactly one current offer result");
  }
  if (new Set(run.offerResults.map((result) => result.offerId)).size !== offerIds.size) {
    throw new Error("Offer results must be unique by offer ID");
  }
  run.offerResults.forEach((result) => {
    if (!offerIds.has(result.offerId)) {
      throw new Error(`Offer result references unknown offer ${result.offerId}`);
    }
  });

  const paymentIds = new Set(run.payments.map((payment) => payment.id));
  const idempotencyKeys = new Set(
    run.payments.map((payment) => payment.idempotencyKey),
  );
  if (paymentIds.size !== run.payments.length) {
    throw new Error("Mission run contains duplicate payment attempt IDs");
  }
  if (idempotencyKeys.size !== run.payments.length) {
    throw new Error("Mission run contains duplicate logical payment attempts");
  }

  run.payments.forEach((payment) => {
    if (payment.runId !== run.id || !offerIds.has(payment.offerId)) {
      throw new Error("Payment attempt references an unknown run or offer");
    }
    if (payment.evidenceMode === "fixture") {
      if (payment.authoritative) {
        throw new Error("Fixture payment evidence can never be authoritative");
      }
      if (!payment.truthLabel.toLowerCase().includes("fixture")) {
        throw new Error("Fixture payment evidence must carry a fixture truth label");
      }
    }
  });

  const deliveryIds = new Set(run.deliveries.map((delivery) => delivery.id));
  run.deliveries.forEach((delivery) => {
    if (!offerIds.has(delivery.offerId)) {
      throw new Error("Delivery references an unknown offer");
    }
    if (
      delivery.paymentAttemptId &&
      !paymentIds.has(delivery.paymentAttemptId)
    ) {
      throw new Error("Delivery references an unknown payment attempt");
    }
  });

  run.outcomes.forEach((outcome) => {
    if (!offerIds.has(outcome.offerId)) {
      throw new Error("Outcome references an unknown offer");
    }
    if (!deliveryIds.has(outcome.deliveryEvidenceId)) {
      throw new Error("Outcome references an unknown delivery record");
    }
  });
}

export function recordDeliveryEvidence(
  run: MissionRun,
  delivery: DeliveryEvidence,
  occurredAt: ISODateTime,
): MissionRun {
  if (run.deliveries.some((item) => item.id === delivery.id)) {
    throw new Error(`Delivery evidence ${delivery.id} already exists`);
  }
  if (!run.offers.some((offer) => offer.id === delivery.offerId)) {
    throw new Error(`Delivery references unknown offer ${delivery.offerId}`);
  }
  if (
    delivery.paymentAttemptId &&
    !run.payments.some((payment) => payment.id === delivery.paymentAttemptId)
  ) {
    throw new Error("Delivery references an unknown payment attempt");
  }

  const offer = run.offers.find((candidate) => candidate.id === delivery.offerId);
  const failedRequiredDelivery = delivery.state === "failed" && offer?.required;
  const eventType =
    delivery.state === "failed"
      ? "resource.delivery_failed"
      : "resource.delivered";
  const events = appendRunEvent(run.events, {
    runId: run.id,
    type: eventType,
    occurredAt,
    publicPayload: {
      offerId: delivery.offerId,
      deliveryEvidenceId: delivery.id,
      state: delivery.state,
      evidenceMode: delivery.evidenceMode,
      truthLabel: delivery.truthLabel,
    },
  });

  const next: MissionRun = {
    ...run,
    status: failedRequiredDelivery ? "failed" : run.status,
    deliveries: [...run.deliveries, delivery],
    offerResults: run.offerResults.map((result) =>
      result.offerId === delivery.offerId
        ? {
            ...result,
            state:
              delivery.state === "failed" ? "delivery_failed" : "delivered",
            deliveryEvidenceId: delivery.id,
          }
        : result,
    ),
    events,
    updatedAt: occurredAt,
  };

  // Payment attempts are intentionally copied unchanged. A valid payment
  // receipt remains payment truth even when the delivered resource is invalid.
  assertMissionRunSerializable(next);
  return next;
}

export function cloneMissionRun(run: MissionRun): MissionRun {
  assertMissionRunSerializable(run);
  return JSON.parse(JSON.stringify(run)) as MissionRun;
}
