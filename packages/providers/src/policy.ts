import { ProviderError } from "./errors.js";

export function isLoopbackEndpoint(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname;
    return (
      hostname === "127.0.0.1" ||
      hostname === "localhost" ||
      hostname === "::1" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

/**
 * Validates whether a model provider endpoint is permitted under the active privacy mode.
 * In local_only mode, only loopback addresses are allowed.
 * Remote endpoints cannot be configured or reached unless privacy mode is hybrid.
 */
export function validateProviderEndpoint(
  baseUrl: string,
  privacyMode: "local_only" | "hybrid" | "offline",
  providerId: string = "unknown"
): void {
  if (privacyMode === "offline") {
    throw new ProviderError({
      message: "Offline privacy mode is active. All network inference is disabled.",
      category: "connection_failure",
      providerId,
      modelId: "none",
      fatal: true
    });
  }

  const isLoopback = isLoopbackEndpoint(baseUrl);

  if (privacyMode === "local_only" && !isLoopback) {
    throw new ProviderError({
      message:
        `Security Policy Violation: Local-only privacy mode prohibits non-loopback endpoint "${baseUrl}". ` +
        `Only local endpoints (127.0.0.1, localhost, ::1) are permitted without explicit hybrid mode opt-in.`,
      category: "authentication_failure",
      providerId,
      modelId: "none",
      fatal: true
    });
  }
}
