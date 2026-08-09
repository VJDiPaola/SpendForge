"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { AuditedPurchaseDecision } from "@/lib/decision";
import type { AtlasFixtureRunEnvelope } from "@/lib/demo";
import type { MissionRun, Money, PaymentAttempt, ResourceOffer, RunEvent } from "@/lib/domain/types";

import { EvidenceBoundary } from "./evidence-boundary";
import styles from "./mission-control.module.css";

type PresentationScenario = "fixture" | "rain-async" | "monad-unavailable";

type MissionControlProps = {
  template: MissionRun;
  initialRun?: MissionRun;
  initialAgentDecision?: AuditedPurchaseDecision;
  presentationScenario?: PresentationScenario;
};

const AGENT_DECISION_RECEIPT_PATH =
  "/api/audit/receipts/audit_atlas_agent_decision_fixture_v1";

const presentationScenarios = {
  "rain-async": {
    eyebrow: "Recorded Rain Sandbox evidence",
    title: "Rain completed the scoped 12-cent sandbox purchase.",
    detail:
      "Rain issued a fresh scoped virtual card, accepted the 12-cent authorization and settlement, and direct transaction readback returned completed with the expected card, user, merchant, MCC, amount, and currency.",
    truth:
      "Authoritative Rain Sandbox evidence. This is a simulated sandbox purchase; no production funds moved.",
    facts: [
      ["Card", "Issued + direct readback matched"],
      ["Authorization", "Provider response accepted"],
      ["Exact transaction GET", "Causal fields matched"],
      ["Settlement POST", "1 · HTTP 200"],
      ["Terminal readback", "Completed"],
      ["Completed spend", "Provider-confirmed sandbox"],
      ["Funding", "HTTP 202 + no causal correlation"],
      ["Safe state", "Closed with receipt"],
    ],
  },
  "monad-unavailable": {
    eyebrow: "Failure-mode rehearsal",
    title: "Monad proof is unavailable. Delivery stays locked.",
    detail:
      "A 402 challenge or signed authorization is not settlement evidence. Without a facilitator or chain reference, SpendForge must preserve the attempt as unproven and stop before delivery.",
    truth:
      "Synthetic rehearsal only. This screen makes no Monad testnet call and does not represent a prior provider event.",
    facts: [
      ["Rail", "Monad Testnet · x402"],
      ["Payment evidence", "No transaction reference"],
      ["Delivery state", "Locked"],
      ["Artifact state", "Unchanged"],
      ["Retry posture", "Duplicate check required"],
      ["Safe state", "Provider unavailable"],
    ],
  },
} as const;

const eventCopy: Record<RunEvent["type"], { title: string; detail: string }> = {
  "run.started": { title: "Mission run created", detail: "The mandate and one idempotent execution record were locked." },
  "plan.created": { title: "Resource plan assembled", detail: "Free and paid candidates were compared against outcome requirements." },
  "offer.considered": { title: "Offer considered", detail: "Fit, provenance, license, delivery risk, and price were evaluated." },
  "offer.declined": { title: "Declined by agent", detail: "A valid option was declined because it contributed less to the mission." },
  "offer.blocked": { title: "Blocked by mandate", detail: "Deterministic policy stopped this offer before any payment attempt." },
  "offer.escalated": { title: "Escalated for review", detail: "The offer requires operator judgment and did not reach a payment rail." },
  "policy.passed": { title: "Within mandate", detail: "Typed server policy found no hard-rule violation for this purchase." },
  "payment.started": { title: "Fixture payment boundary invoked", detail: "This local path records the provider contract without sending a transaction." },
  "payment.authorized": { title: "Fixture authorization recorded", detail: "No Rain authorization is claimed until a live sandbox readback exists." },
  "payment.settled": { title: "Fixture settlement recorded", detail: "The receipt is synthetic and cannot be used as provider verification." },
  "payment.reconciliation_required": { title: "Needs reconciliation", detail: "Dependent delivery remains frozen until authoritative provider readback." },
  "resource.delivered": { title: "Resource delivered", detail: "A vetted manifest and content hash were attached to the purchase record." },
  "resource.delivery_failed": { title: "Resource delivery failed", detail: "Payment truth remains separate; composition did not continue." },
  "artifact.composed": { title: "Artifact composed", detail: "Only allowlisted manifest fields and known component identifiers were used." },
  "evaluation.completed": { title: "Fixture outcome recorded", detail: "Versioned deterministic checks evaluated the fixture-composed Atlas artifact." },
  "authority.proposed": { title: "Future authority proposed", detail: "The recommendation is evidence-bound and has not changed any Rain control." },
  "run.completed": { title: "Mission complete", detail: "The fixture run, artifact, evidence, and ledger are available." },
  "run.failed": { title: "Mission failed", detail: "No further purchase or delivery step was attempted." },
};

const auditPhases = [
  { id: "mandate", number: "01", title: "Lock mandate", summary: "Objective, budget, and idempotent run recorded.", types: ["run.started", "plan.created"] },
  { id: "decide", number: "02", title: "Decide", summary: "Every offer receives a named policy result.", types: ["offer.considered", "offer.declined", "offer.blocked", "offer.escalated"] },
  { id: "purchase", number: "03", title: "Purchase", summary: "Allowed resources cross typed payment boundaries.", types: ["policy.passed", "payment.started", "payment.authorized", "payment.settled", "payment.reconciliation_required"] },
  { id: "deliver", number: "04", title: "Deliver", summary: "Vetted manifests arrive with hashes and licenses.", types: ["resource.delivered", "resource.delivery_failed"] },
  { id: "verify", number: "05", title: "Verify outcome", summary: "Compose, evaluate, and propose future authority.", types: ["artifact.composed", "evaluation.completed", "authority.proposed", "run.completed", "run.failed"] },
] as const satisfies ReadonlyArray<{ id: string; number: string; title: string; summary: string; types: ReadonlyArray<RunEvent["type"]> }>;

function formatMoney(money: Money) {
  const digits = money.amount.padStart(money.decimals + 1, "0");
  const whole = digits.slice(0, -money.decimals || undefined);
  const fraction = money.decimals > 0 ? digits.slice(-money.decimals).replace(/0+$/, "") : "";
  const prefix = money.asset === "USD" || money.asset === "rUSD" ? "$" : "";
  const suffix = money.asset === "USDC" ? " test USDC" : "";
  return `${prefix}${fraction ? `${whole}.${fraction}` : whole}${suffix}`;
}

function payloadString(event: RunEvent, key: string) {
  const value = event.publicPayload[key];
  return typeof value === "string" ? value : undefined;
}

function getOfferForEvent(event: RunEvent, offers: ResourceOffer[]) {
  return offers.find((offer) => offer.id === payloadString(event, "offerId"));
}

function railLabel(rail: ResourceOffer["rail"] | PaymentAttempt["rail"] | undefined) {
  if (rail === "rain_card") return "Rain Sandbox";
  if (rail === "monad_x402") return "Monad x402";
  if (rail === "free") return "No payment rail";
  return "SpendForge";
}

function railClass(rail: ResourceOffer["rail"] | PaymentAttempt["rail"] | undefined) {
  if (rail === "rain_card") return styles.rain;
  if (rail === "monad_x402") return styles.monad;
  return styles.system;
}

function truncateReference(value: string | undefined) {
  if (!value) return "Not issued";
  return value.length <= 18 ? value : `${value.slice(0, 9)}…${value.slice(-6)}`;
}

export function MissionControl({
  template,
  initialRun,
  initialAgentDecision,
  presentationScenario = "fixture",
}: MissionControlProps) {
  const router = useRouter();
  const [run, setRun] = useState<MissionRun | undefined>(initialRun);
  const [agentDecision, setAgentDecision] = useState<
    AuditedPurchaseDecision | undefined
  >(initialAgentDecision);
  const [visibleEventCount, setVisibleEventCount] = useState(initialRun?.events.length ?? 0);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const events = run?.events ?? [];
  const visibleEvents = events.slice(0, visibleEventCount);
  const running = Boolean(run && visibleEventCount < events.length);
  const lastEvent = visibleEvents.at(-1);
  const scenario = presentationScenario === "fixture" ? undefined : presentationScenarios[presentationScenario];
  const providerActionPaused = Boolean(scenario);

  useEffect(() => {
    if (!running) return;
    const timeout = window.setTimeout(() => setVisibleEventCount((count) => Math.min(count + 1, events.length)), 190);
    return () => window.clearTimeout(timeout);
  }, [events.length, running, visibleEventCount]);

  const deliveredCount = visibleEvents.filter((event) => event.type === "resource.delivered").length;
  const artifactComposed = visibleEvents.some((event) => event.type === "artifact.composed");
  const evaluationVisible = visibleEvents.some((event) => event.type === "evaluation.completed");
  const proposalVisible = visibleEvents.some((event) => event.type === "authority.proposed");
  const complete = visibleEvents.some((event) => event.type === "run.completed");
  const decisionReady = visibleEvents.some((event) => ["offer.declined", "offer.blocked", "policy.passed"].some((type) => type === event.type));

  const purchasedPayments = useMemo(() => {
    if (!run) return [];
    return run.payments.map((payment) => ({
      payment,
      offer: run.offers.find((offer) => offer.id === payment.offerId),
      delivery: run.deliveries.find((delivery) => delivery.paymentAttemptId === payment.id),
    }));
  }, [run]);

  const decisionRows = (run ?? template).offerResults.map((result) => {
    const offer = template.offers.find((entry) => entry.id === result.offerId);
    const label = result.finalAction === "buy" ? "Within mandate" : result.finalAction === "decline" ? "Declined by agent" : result.finalAction === "block" ? "Blocked by mandate" : "Escalated for review";
    return { id: result.offerId, label, title: offer?.title ?? result.offerId, action: result.finalAction };
  });
  const selectedAgentOffer = template.offers.find(
    (offer) => offer.id === agentDecision?.policyVerification.selectedResourceId,
  );
  const agentDecisionVisible = decisionReady && Boolean(agentDecision);

  async function startMission() {
    if (providerActionPaused || isStarting || running || complete) return;
    setError(null);
    setIsStarting(true);
    try {
      const response = await fetch("/api/demo/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ missionId: template.mission.id }) });
      if (!response.ok) throw new Error("The fixture run could not be created.");
      const envelope = (await response.json()) as AtlasFixtureRunEnvelope;
      setRun(envelope.run);
      setAgentDecision(envelope.agentDecision);
      setVisibleEventCount(1);
      router.replace(`/missions/atlas-launch-v1?run=${encodeURIComponent(envelope.run.id)}` as Route, { scroll: false });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The fixture run could not be created.");
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <div className={styles.controlRoom}>
      <nav className={styles.demoNavigator} aria-label="Demo evidence views">
        <div>
          <span>Judged demo views</span>
          <strong>Switch evidence without changing provider state</strong>
        </div>
        <div>
          <Link
            aria-current={presentationScenario === "fixture" ? "page" : undefined}
            className={presentationScenario === "fixture" ? styles.demoViewActive : ""}
            href="/missions/atlas-launch-v1"
          >
            Fixture walkthrough
          </Link>
          <Link
            aria-current={presentationScenario === "rain-async" ? "page" : undefined}
            className={presentationScenario === "rain-async" ? styles.demoViewActive : ""}
            href="/missions/atlas-launch-v1?scenario=rain-async"
          >
            Completed Rain proof
          </Link>
          <Link
            aria-current={presentationScenario === "monad-unavailable" ? "page" : undefined}
            className={presentationScenario === "monad-unavailable" ? styles.demoViewActive : ""}
            href="/missions/atlas-launch-v1?scenario=monad-unavailable"
          >
            Monad unavailable
          </Link>
        </div>
      </nav>

      <section className={styles.receiptHeader} aria-labelledby="mission-title">
        <div className={styles.titleBlock}>
          <div className={styles.kickerRow}>
            <span className={styles.fixtureBadge}>
              {presentationScenario === "rain-async"
                ? "Rain Sandbox · redacted provider evidence"
                : presentationScenario === "monad-unavailable"
                  ? "Failure rehearsal · no provider call"
                  : "Fixture mode · No provider transactions"}
            </span>
            <span className={styles.syntheticBadge}>Synthetic mission</span>
          </div>
          <h1 id="mission-title">{template.mission.title}</h1>
          <p>{template.mission.objective}</p>
        </div>
        <div className={styles.statusModule}>
          <span>{scenario ? "Safeguard status" : "Run status"}</span>
          <strong>{scenario ? (presentationScenario === "rain-async" ? "Completed" : "Provider unavailable") : complete ? "Fixture outcome recorded" : running ? "Mission in progress" : "Ready for review"}</strong>
          <p>{scenario ? (presentationScenario === "rain-async" ? "Closed with authoritative receipt" : "Dependent actions remain paused") : complete ? "5 fixture audit stages recorded" : `${visibleEvents.length} of ${template.events.length} fixture events`}</p>
        </div>
        <div className={styles.runArea}>
          <button aria-busy={isStarting || running} className={styles.runButton} data-testid="run-mission" disabled={providerActionPaused || isStarting || running || complete} onClick={startMission} type="button">{providerActionPaused ? "Provider action paused" : isStarting ? "Creating run…" : running ? "Mission running…" : complete ? "Fixture complete" : "Run mission"}</button>
          <span>{providerActionPaused ? "No mutation can start from this view" : "One bounded run · Duplicate-safe"}</span>
        </div>
      </section>

      {scenario ? (
        <section className={`${styles.providerState} ${presentationScenario === "rain-async" ? styles.providerStateRain : styles.providerStateMonad}`} data-testid="failure-scenario">
          <div className={styles.providerStateCopy}>
            <p className="eyebrow">{scenario.eyebrow}</p>
            <h2>{scenario.title}</h2>
            <p>{scenario.detail}</p>
            <strong>{scenario.truth}</strong>
          </div>
          <dl>
            {scenario.facts.map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
          <div className={styles.providerStateAction}>
            <span>{presentationScenario === "rain-async" ? "Mutation gates closed" : "Delivery blocked"}</span>
            <Link href={presentationScenario === "rain-async" ? "/api/audit/receipts/audit_rain_northstar_completed_20260809_v1" : "/ledger#monad-provider-evidence"}>{presentationScenario === "rain-async" ? "View completed receipt →" : "Open safe ledger evidence →"}</Link>
          </div>
        </section>
      ) : null}

      <EvidenceBoundary compact />

      {error ? <p className={styles.errorBanner}>{error} No provider action was attempted.</p> : null}
      <p className={styles.srStatus} role="status" aria-live="polite">{lastEvent ? eventCopy[lastEvent.type].title : "Mission ready"}</p>

      <section className={styles.auditLayout}>
        <aside className={styles.summaryColumn} aria-label="Mission summary">
          <div className={styles.summaryHeading}><span>At a glance</span><strong>{complete ? "Recorded" : running ? "Running" : "Ready"}</strong></div>
          <dl className={styles.summaryFacts}>
            <div><dt>Total budget</dt><dd>{formatMoney(template.mandate.totalBudget)}</dd></div>
            <div><dt>Per purchase</dt><dd>{formatMoney(template.mandate.perPurchaseCap)}</dd></div>
            <div><dt>Evidence</dt><dd>{complete ? "4 records" : "Available after run"}</dd></div>
            <div><dt>Deadline</dt><dd>{new Date(template.mandate.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</dd></div>
          </dl>
          <section className={styles.decisionReceipt} aria-labelledby="policy-decision-title">
            <p>Deterministic policy</p><h2 id="policy-decision-title">{decisionReady ? "2 permitted · 3 withheld" : "Awaiting evaluation"}</h2>
            <ul>{decisionReady ? decisionRows.map((decision) => <li className={styles[decision.action]} key={decision.id}><span>{decision.label}</span><strong>· {decision.title}</strong></li>) : <li><span>Five seeded offers will be checked against twelve hard rules.</span></li>}</ul>
          </section>
          <section className={`${styles.agentDecision} ${agentDecisionVisible ? styles.agentDecisionReady : ""}`} data-testid="agent-decision-receipt">
            <div><p>Bounded agent proposal</p><span>{agentDecisionVisible ? "Policy verified" : "Waiting"}</span></div>
            <h2>{agentDecisionVisible ? `${agentDecision?.proposal.action} · ${selectedAgentOffer?.title ?? "Catalog resource"}` : "No proposal recorded"}</h2>
            <p>{agentDecisionVisible ? "Deterministic fixture adapter · No OpenAI API call" : "The proposal is recorded during the fixture run."}</p>
            {agentDecisionVisible && agentDecision ? (
              <details>
                <summary>View auditable model fields</summary>
                <dl>
                  <div><dt>Model</dt><dd>{agentDecision.modelId}</dd></div>
                  <div><dt>Prompt</dt><dd>{agentDecision.promptVersion}</dd></div>
                  <div><dt>Input digest</dt><dd>{truncateReference(agentDecision.inputDigest)}</dd></div>
                  <div><dt>Verified action</dt><dd>{agentDecision.policyVerification.finalAction}</dd></div>
                  <div><dt>Maximum</dt><dd>${(agentDecision.policyVerification.verifiedMaximumAuthorizedCents / 100).toFixed(2)}</dd></div>
                  <div><dt>Reasoning</dt><dd>Concise rationale only · no chain-of-thought stored</dd></div>
                </dl>
                <p>{agentDecision.proposal.rationale}</p>
                <a download href={AGENT_DECISION_RECEIPT_PATH}>Download fixture decision JSON ↓</a>
              </details>
            ) : null}
          </section>
          <details className={styles.disclosurePanel}><summary>Mandate details</summary><dl><div><dt>Permitted</dt><dd>{template.mandate.allowedResourceTypes.join(" + ")}</dd></div><div><dt>License use</dt><dd>{template.mandate.allowedLicenseUsages.join(", ")}</dd></div><div><dt>Execution</dt><dd>Fixture only · no network adapters</dd></div></dl></details>
        </aside>

        <section className={styles.flowColumn} aria-labelledby="timeline-title">
          <div className={styles.flowHeader}><div><p className="eyebrow">Mission audit</p><h2 id="timeline-title">Five recorded steps</h2></div><span>{visibleEvents.length}/{template.events.length} events</span></div>
          <ol className={styles.auditFlow} data-testid="decision-timeline">
            {auditPhases.map((phase) => {
              const phaseEvents = visibleEvents.filter((event) => phase.types.some((type) => type === event.type));
              const active = Boolean(lastEvent && phase.types.some((type) => type === lastEvent.type) && running);
              const recorded = phaseEvents.length > 0;
              const phaseStatus = phase.id === "verify" && complete ? "Mission complete" : active ? "Active" : recorded ? "Recorded" : "Queued";
              return (
                <li className={`${recorded ? styles.phaseRecorded : ""} ${active ? styles.phaseActive : ""}`} key={phase.id}>
                  <span className={styles.phaseNumber} aria-hidden="true">{phase.number}</span>
                  <details className={styles.phaseDetails} data-testid={`phase-${phase.id}`}>
                    <summary><span><strong>{phase.title}</strong><small>{phase.summary}</small></span><em>{phaseStatus}</em></summary>
                    <div className={styles.phaseEvents}>{phaseEvents.length ? phaseEvents.map((event) => {
                      const offer = getOfferForEvent(event, template.offers);
                      const copy = eventCopy[event.type];
                      return <article key={`${event.sequence}-${event.type}`}><div><time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><span className={railClass(offer?.rail)}>{railLabel(offer?.rail)}</span></div><strong>{offer ? `${copy.title} · ${offer.title}` : copy.title}</strong><p>{copy.detail}</p></article>;
                    }) : <p>No event recorded for this step yet.</p>}</div>
                  </details>
                </li>
              );
            })}
          </ol>
        </section>

        <aside className={styles.evidenceColumn} aria-label="Artifact and evidence">
          <div className={styles.artifactPanel} data-testid="artifact-preview">
            <div className={styles.panelHeader}><div><p className="eyebrow">Resulting artifact</p><h2>Atlas launch page</h2></div><span className={`${styles.stateBadge} ${complete ? styles.stateComplete : ""}`}>{complete ? "Fixture checks passed" : artifactComposed ? "Composed" : deliveredCount ? "Assembling" : "Locked"}</span></div>
            <div className={`${styles.atlasPreview} ${deliveredCount >= 2 ? styles.withNorthstar : ""}`}><span>ATLAS / AGENT OPS</span><h3>Autonomy you can inspect.</h3><p>{deliveredCount >= 1 ? "Pulse manifest applied" : "Pulse manifest locked"}</p><p>{deliveredCount >= 2 ? "Northstar license applied" : "Northstar license locked"}</p></div>
            <div className={styles.artifactFooter}><span>{artifactComposed ? "Known manifests · hashes recorded" : "Waiting for delivery evidence"}</span>{complete ? <Link href="/artifacts/atlas-launch-v1">Open artifact ↗</Link> : null}</div>
          </div>
          <details className={styles.evidenceDrawer}>
            <summary><span><strong>Evidence drawer</strong><small>{complete ? "4 records available" : "Records unlock as events settle"}</small></span><em>{complete ? "Available" : "Pending"}</em></summary>
            <div className={styles.evidenceStack}>
              {purchasedPayments.map(({ payment, offer, delivery }) => {
                const visible = visibleEvents.some((event) => payloadString(event, "offerId") === payment.offerId && event.type === "payment.settled");
                const testId = payment.rail === "rain_card" ? "ledger-row-rain" : "ledger-row-x402";
                return <article className={`${styles.evidenceCard} ${visible ? styles.evidenceVisible : ""}`} data-testid={testId} key={payment.id}><div className={styles.evidenceCardTop}><span className={`${styles.railBadge} ${railClass(payment.rail)}`}>{railLabel(payment.rail)}</span><span>{visible ? "Synthetic receipt recorded" : "Waiting"}</span></div><h3>{offer?.title ?? "Resource purchase"}</h3><dl><div><dt>Amount</dt><dd>{formatMoney(payment.amount)}</dd></div><div><dt>Receipt</dt><dd>{visible ? truncateReference(payment.receipt?.reference) : "Not issued"}</dd></div><div><dt>Delivery</dt><dd>{visible && delivery ? delivery.state : "locked"}</dd></div></dl><p>{visible ? payment.truthLabel : "No provider claim before the fixture event is recorded."}</p><Link href={`/ledger#receipt-${payment.offerId}` as Route}>Open ledger proof →</Link></article>;
              })}
              <article className={`${styles.evidenceCard} ${evaluationVisible ? styles.evidenceVisible : ""}`}><div className={styles.evidenceCardTop}><span className={`${styles.railBadge} ${styles.system}`}>Outcome checks</span><span>{evaluationVisible && run?.evaluation?.passed ? "Passed" : "Waiting"}</span></div><h3>{run?.evaluation ? `${run.evaluation.checks.filter((check) => check.passed).length}/${run.evaluation.checks.length} deterministic checks` : "Deterministic evaluation"}</h3><p>{evaluationVisible ? "Evaluator v1 reproduced the versioned fixture content and provenance checks defined for this artifact." : "Checks unlock only after composition."}</p></article>
              <article className={`${styles.evidenceCard} ${proposalVisible ? styles.evidenceVisible : ""}`} data-testid="authority-proposal"><div className={styles.evidenceCardTop}><span className={`${styles.railBadge} ${styles.system}`}>Earned authority</span><span>{proposalVisible ? "Proposed" : "Locked"}</span></div><h3>Proposed next limit</h3><p>{proposalVisible && run?.autonomyProposal ? `${formatMoney(run.autonomyProposal.currentPerPurchaseCap)} → ${formatMoney(run.autonomyProposal.proposedPerPurchaseCap)}` : "Requires a verified outcome first."}</p><small>Operator review required · Not applied to Rain</small></article>
            </div>
          </details>
        </aside>
      </section>
    </div>
  );
}
