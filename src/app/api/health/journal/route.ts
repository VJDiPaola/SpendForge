import "server-only";

import {
  getJournalReadiness,
  JournalReadinessError,
} from "@/lib/operations/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const safeHeaders = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(): Promise<Response> {
  try {
    const readiness = await getJournalReadiness();
    return Response.json(readiness, {
      status: readiness.ok ? 200 : 503,
      headers: safeHeaders,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof JournalReadinessError
            ? error.code
            : "JOURNAL_READINESS_UNAVAILABLE",
        providerCalls: 0,
      },
      { status: 503, headers: safeHeaders },
    );
  }
}
