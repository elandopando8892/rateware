function origin(value: string): string {
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" || parsed.username || parsed.password ||
      parsed.search || parsed.hash ||
      (parsed.pathname !== "" && parsed.pathname !== "/")
    ) throw new Error("OSP_WORKER_CONFIGURATION");
    return parsed.origin;
  } catch {
    throw new Error("OSP_WORKER_CONFIGURATION");
  }
}

export async function triggerOspGmailWorker(input: {
  supabaseUrl: string;
  serviceRoleKey: string;
  limit?: number;
  fetch?: typeof globalThis.fetch;
}): Promise<{ enqueued: number; processed: number }> {
  const limit = input.limit ?? 10;
  if (
    input.serviceRoleKey.length < 32 || !Number.isSafeInteger(limit) ||
    limit < 1 || limit > 25
  ) throw new Error("OSP_WORKER_CONFIGURATION");
  const response = await (input.fetch ?? globalThis.fetch)(
    `${origin(input.supabaseUrl)}/functions/v1/osp-worker`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "drain_rateware_gmail", limit }),
      signal: AbortSignal.timeout(90_000),
    },
  );
  if (!response.ok) throw new Error("OSP_WORKER_UNAVAILABLE");
  const payload = await response.json() as Record<string, unknown>;
  const enqueued = Number(payload.enqueued);
  const processed = Number(payload.processed);
  if (
    !Number.isSafeInteger(enqueued) || enqueued < 0 ||
    !Number.isSafeInteger(processed) || processed < 0
  ) throw new Error("OSP_WORKER_UNAVAILABLE");
  return { enqueued, processed };
}

export async function triggerOspSupplierPackageCanary(input: {
  supabaseUrl: string;
  serviceRoleKey: string;
  organizationId: string;
  caseId: string;
  snapshotId: string;
  snapshotSha256: string;
  fetch?: typeof globalThis.fetch;
}): Promise<{ processed: 1 }> {
  if (
    input.serviceRoleKey.length < 32 ||
    !/^[0-9a-f-]{36}$/i.test(input.organizationId) ||
    !/^[0-9a-f-]{36}$/i.test(input.caseId) ||
    !/^[0-9a-f-]{36}$/i.test(input.snapshotId) ||
    !/^[0-9a-f]{64}$/.test(input.snapshotSha256)
  ) throw new Error("OSP_WORKER_CONFIGURATION");
  const response = await (input.fetch ?? globalThis.fetch)(
    `${origin(input.supabaseUrl)}/functions/v1/osp-worker`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "run_supplier_package_canary",
        organizationId: input.organizationId,
        caseId: input.caseId,
        snapshotId: input.snapshotId,
        snapshotSha256: input.snapshotSha256,
      }),
      signal: AbortSignal.timeout(120_000),
    },
  );
  if (!response.ok) throw new Error("OSP_WORKER_UNAVAILABLE");
  const payload = await response.json() as Record<string, unknown>;
  if (payload.processed !== 1) throw new Error("OSP_WORKER_UNAVAILABLE");
  return { processed: 1 };
}
