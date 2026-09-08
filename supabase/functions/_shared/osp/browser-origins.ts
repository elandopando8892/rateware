// Browser CORS is not authorization. JWT, tenant, role and fresh-approval checks
// remain mandatory. An optional preview adds one exact origin, never a wildcard.
export function ospBrowserOrigins(
  approvedPreviewOrigin?: string,
): ReadonlySet<string> {
  const origins = new Set([
    "http://localhost:8791",
    "https://osp.heymarksman.com",
  ]);
  if (approvedPreviewOrigin !== undefined) {
    if (
      !/^https:\/\/osp-customer-setup(?:-[a-z0-9-]+)?-elandopando8892s-projects\.vercel\.app$/
        .test(approvedPreviewOrigin)
    ) {
      throw new Error("INVALID_OSP_PREVIEW_ORIGIN");
    }
    origins.add(approvedPreviewOrigin);
  }
  return origins;
}
