import { getIntegrationHealth } from "@/lib/integrations/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  const health = getIntegrationHealth();

  return Response.json(health, {
    status: health.ok ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
