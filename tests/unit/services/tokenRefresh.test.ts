import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { refreshClaudeOAuthToken } from "../../../services/tokenRefresh.ts";

describe("refreshClaudeOAuthToken", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should return null on network failure", async () => {
    globalThis.fetch = () => Promise.reject(new Error("Network failure"));
    const result = await refreshClaudeOAuthToken("mock-refresh-token");
    expect(result).toBeNull();
  });

  it("should return null on non-ok HTTP response", async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response("Bad Request", {
          status: 400,
          statusText: "Bad Request",
        })
      );
    const result = await refreshClaudeOAuthToken("mock-refresh-token");
    expect(result).toBeNull();
  });

  it("should return parsed tokens on successful response", async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: "new-access-token",
            refresh_token: "new-refresh-token",
            expires_in: 3600,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      );
    const result = await refreshClaudeOAuthToken("mock-refresh-token");
    expect(result).toEqual({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      expiresIn: 3600,
    });
  });
});
