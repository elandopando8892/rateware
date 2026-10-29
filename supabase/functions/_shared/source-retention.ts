/** Interim application interlock, not provider-level WORM or a backup.
 * Deploy to ALL source writers before enabling evidence-backed features.
 * Keep RATEWARE_SOURCE_RETENTION_ENABLED=true while historical evidence exists,
 * even after disabling its commercial feature flags. This is not a reference
 * inventory and cannot infer that deletion is safe when every flag is off.
 * No reference-count preflight: denying all destructive source mutations avoids
 * a new bid committing between a count query and the external Storage call.
 */
export function sourceRetentionDenial() {
  const active = [
    "RATEWARE_SOURCE_RETENTION_ENABLED",
    "RATEWARE_NATIVE_BID_ORIGINAL_SOURCE_ENABLED",
    "RATEWARE_CLIENT_FEE_ACCEPTANCE_ENABLED",
    "RATEWARE_CLIENT_FEE_REVOCATION_ENABLED",
    "RATEWARE_NATIVE_CLIENT_FEE_READ_ENABLED",
    "RATEWARE_NATIVE_CLIENT_FEE_ATOMIC_ENABLED",
  ].some((key) => Deno.env.get(key) === "true");
  if (!active) {
    return null;
  }
  return {
    code: "SOURCE_RETENTION_ACTIVE",
    error:
      "El archivo original se conserva como evidencia. Puedes archivarlo; no borrarlo ni sustituirlo.",
  };
}

export function assertSourceMutationAllowed(
  bucket: string,
  destructive: boolean,
) {
  if (bucket !== "raw-uploads" || !destructive) return;
  const denial = sourceRetentionDenial();
  if (denial) throw new Error(`${denial.code}: ${denial.error}`);
}
