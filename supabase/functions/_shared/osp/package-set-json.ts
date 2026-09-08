// PostgreSQL jsonb may reorder object keys. Hash and compare canonical JSON,
// preserving array order because it represents the ordered set membership.
export function canonicalPackageSetJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalPackageSetJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${
      Object.keys(record).filter((key) => record[key] !== undefined)
        .sort().map((key) =>
          `${JSON.stringify(key)}:${canonicalPackageSetJson(record[key])}`
        )
        .join(",")
    }}`;
  }
  const encoded = JSON.stringify(value);
  if (typeof encoded !== "string") {
    throw new Error("SUPPLIER_PACKAGE_SET_INPUT_INVALID");
  }
  return encoded;
}
