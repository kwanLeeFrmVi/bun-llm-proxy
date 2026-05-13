/**
 * Classify network-level errors for better diagnostics.
 * Returns a category tag and optional human-readable suggestion.
 */
export function classifyNetworkError(msg: string): { category: string; suggestion: string } {
  if (msg.includes("unable to verify the first certificate") || msg.includes("certificate")) {
    return {
      category: "TLS_ERROR",
      suggestion:
        "Upstream server has a certificate issue (invalid, expired, or self-signed). Check with the provider.",
    };
  }
  if (msg.includes("ECONNREFUSED")) {
    return { category: "CONNECTION_REFUSED", suggestion: "Server may be down." };
  }
  if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) {
    return { category: "DNS_ERROR", suggestion: "DNS resolution failed." };
  }
  if (msg.includes("ETIMEDOUT") || msg.includes("timed out")) {
    return { category: "TIMEOUT", suggestion: "Connection timed out." };
  }
  return { category: "NETWORK_ERROR", suggestion: "" };
}
