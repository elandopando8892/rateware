// Recovered from production 2026-08-18. Deployed to rateware-prod on 2026-08-17
// (version 5) without a source commit; reconstructed verbatim from the deployed
// bundle so the repository is the source of truth again.
//
// The canary run is finished: the function is retained as a deployed tombstone
// so any caller still pointed at it receives 410 Gone rather than a 404 that
// would look like a routing failure.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve((req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }
  return Response.json(
    { ok: false, error: "canary_processing_complete" },
    { status: 410 },
  );
});
