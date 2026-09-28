// Preserve the caller's identity. Never substitute a service credential.
// rateware-api already authenticated this bearer, so a downstream 401 is a
// storage-service failure, not an expired session.
const downstreamStatus = (status) => (status === 401 ? 502 : status);
const sameId = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

export async function forwardSourceDownload(request, body, supabaseUrl, transport = fetch) {
  if (body.action !== "get_upload_source_url") throw new Error("Unsupported download action.");
  if (!supabaseUrl) throw new Error("Storage routing is not configured.");
  const authorization = request.headers.get("Authorization");
  if (!authorization) return { status: 401, payload: { error: "Authentication required." } };
  const response = await transport(new URL("/functions/v1/rateware-storage-api", supabaseUrl), {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify({ action: body.action, id: body.id }),
    signal: AbortSignal.timeout(60_000)
  });
  let payload;
  try { payload = await response.json(); }
  catch { return { status: 502, payload: { error: "Storage service returned an invalid response." } }; }
  if (!response.ok) return { status: downstreamStatus(response.status), payload: { error: "Source download is unavailable or not authorized." } };
  if (!payload || typeof payload.url !== "string" || payload.expires_in_seconds !== 600) {
    return { status: 502, payload: { error: "Storage service returned an invalid download." } };
  }
  return { status: response.status, payload: {
    url: payload.url, expires_in_seconds: payload.expires_in_seconds,
    filename: payload.filename, mime_type: payload.mime_type
  } };
}

// Files kept outside Supabase Storage (Oracle) are deleted by the storage
// service, which also removes verified replicas and writes the audit entry.
export async function forwardSourceRemoval(request, body, supabaseUrl, transport = fetch) {
  if (body.action !== "remove_upload") throw new Error("Unsupported removal action.");
  if (!supabaseUrl) throw new Error("Storage routing is not configured.");
  const authorization = request.headers.get("Authorization");
  if (!authorization) return { status: 401, payload: { error: "Authentication required." } };
  const response = await transport(new URL("/functions/v1/rateware-storage-api", supabaseUrl), {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    // The caller's own confirmation travels as received; the storage service checks it again.
    body: JSON.stringify({ action: body.action, id: body.id, confirmed: body.confirmed, confirmation_action: body.confirmation_action }),
    signal: AbortSignal.timeout(60_000)
  });
  let payload;
  try { payload = await response.json(); }
  catch { return { status: 502, payload: { error: "Storage service returned an invalid response." } }; }
  if (!response.ok) return { status: downstreamStatus(response.status), payload: { error: "Upload removal is unavailable or not authorized." } };
  if (!payload?.removed || !sameId(payload.removed.id, body.id)) {
    return { status: 502, payload: { error: "Storage service returned an invalid removal." } };
  }
  return { status: response.status, payload: { removed: { id: payload.removed.id } } };
}
