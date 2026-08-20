type OAuthReturnOptions = {
  defaultOrigin: string;
  configuredOrigins?: string | null;
  fallbackPath?: string;
};

function allowedOrigin(value: string) {
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol)
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
    throw new Error("OAuth return origin configuration is invalid.");
  }
  return url.origin;
}

export function resolveOAuthReturnTarget(
  value: string | null | undefined,
  options: OAuthReturnOptions
) {
  const defaultOrigin = allowedOrigin(options.defaultOrigin);
  const configuredOrigins = String(options.configuredOrigins || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map(allowedOrigin);
  const allowedOrigins = new Set([defaultOrigin, ...configuredOrigins]);
  const target = new URL(String(value || options.fallbackPath || "settings.html").trim(), `${defaultOrigin}/`);

  if (!["https:", "http:"].includes(target.protocol) || target.username || target.password) {
    throw new Error("OAuth return URL is not allowed.");
  }
  if (!allowedOrigins.has(target.origin)) {
    throw new Error("OAuth return origin is not allowed.");
  }
  return target.toString();
}
