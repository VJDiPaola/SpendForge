import type {
  ISODateTime,
  JsonValue,
  RunEvent,
  RunEventType,
} from "./types";

function isCanonicalIsoDateTime(value: string): value is ISODateTime {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function assertJsonValue(
  value: unknown,
  path = "publicPayload",
  ancestors = new Set<object>(),
): asserts value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${path} contains a non-finite number`);
    }
    return;
  }

  if (typeof value !== "object") {
    throw new Error(`${path} contains a non-JSON value`);
  }

  if (ancestors.has(value)) {
    throw new Error(`${path} contains a circular reference`);
  }
  ancestors.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertJsonValue(item, `${path}[${index}]`, ancestors),
    );
    ancestors.delete(value);
    return;
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${path} must contain plain JSON objects only`);
  }

  for (const [key, child] of Object.entries(value)) {
    assertJsonValue(child, `${path}.${key}`, ancestors);
  }
  ancestors.delete(value);
}

function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function appendRunEvent(
  events: readonly RunEvent[],
  event: {
    runId: string;
    type: RunEventType;
    occurredAt: ISODateTime;
    publicPayload: Record<string, JsonValue>;
  },
): RunEvent[] {
  assertCanonicalEventLog(events, event.runId);

  if (!isCanonicalIsoDateTime(event.occurredAt)) {
    throw new Error("Run event occurredAt must be a canonical ISO timestamp");
  }

  const previous = events.at(-1);
  if (
    previous &&
    Date.parse(event.occurredAt) < Date.parse(previous.occurredAt)
  ) {
    throw new Error("Run events cannot be appended out of chronological order");
  }

  assertJsonValue(event.publicPayload);

  const next: RunEvent = {
    sequence: events.length + 1,
    runId: event.runId,
    type: event.type,
    occurredAt: event.occurredAt,
    publicPayload: cloneJson(event.publicPayload),
  };

  return [...events, next];
}

export function assertCanonicalEventLog(
  events: readonly RunEvent[],
  expectedRunId?: string,
): void {
  let previousTimestamp = Number.NEGATIVE_INFINITY;
  let canonicalRunId = expectedRunId;

  events.forEach((event, index) => {
    const expectedSequence = index + 1;
    if (event.sequence !== expectedSequence) {
      throw new Error(
        `Run event sequence ${event.sequence} is not canonical; expected ${expectedSequence}`,
      );
    }

    canonicalRunId ??= event.runId;
    if (event.runId !== canonicalRunId) {
      throw new Error("A canonical event log cannot mix run IDs");
    }
    if (!isCanonicalIsoDateTime(event.occurredAt)) {
      throw new Error("Run event occurredAt must be a canonical ISO timestamp");
    }

    const currentTimestamp = Date.parse(event.occurredAt);
    if (currentTimestamp < previousTimestamp) {
      throw new Error("Run event timestamps are out of order");
    }
    previousTimestamp = currentTimestamp;

    assertJsonValue(event.publicPayload);
  });
}
