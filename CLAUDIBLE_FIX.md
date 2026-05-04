# Claudible Authentication Fix Summary

## 🔴 The Problem

Direct `curl` or `claude-code` requests to `claudible.io` worked, but requests through the proxy failed with **403 Forbidden** and triggered model locking.

The upstream error revealed:
`{"error":{"message":"This endpoint is reserved for Claude Code. Please use /v1/chat/completions or /v1/responses instead.","type":"forbidden"}}`

## 🔍 Root Cause

The proxy was being "too clean". For any non-official Anthropic upstream (like `claudible.io`), it was **stripping** all Claude Code identity headers (like `anthropic-beta`, `x-app`, etc.) to prevent leaking them.

However, `claudible.io` uses these headers to identify legitimate Claude Code traffic to allow access to the `/v1/messages` endpoint. Without them, it rejected the request.

## 🛠️ Fixes Applied

### 1. Selective Header Forwarding

Modified `ai-bridge/handlers/provider.ts` to detect if the incoming request is from a Claude Code client.

- **If Claude Code**: Forward the cached identity headers (preserving `anthropic-beta` flags etc.).
- **If Not Claude Code**: Continue stripping them to keep requests clean.

### 2. Header Wiring & Logging

Modified `ai-bridge/handlers/chatCore.ts`:

- Passed raw client headers into the header builder so it can perform detection.
- **Improved Debugging**: Added logging for the **raw upstream error body** before normalization. This is what allowed us to see the "reserved for Claude Code" message.

### 3. Health Check Robustness

Modified `lib/providerTest.ts`:

- Removed redundant `Authorization: Bearer` headers when testing Anthropic-compatible providers (which primarily use `x-api-key`).
- Made the `/api/user/status` fallback optional so the test doesn't fail just because that specific endpoint is missing on a compatible provider.

### 4. Database Recovery

- Restored `baseUrl: "https://claudible.io"` for the `ccd` provider connection.
- Cleared active `modelLock_*` entries from `provider_specific_data` to allow immediate testing.

## ✅ Verification

Tested using a real `claude-code` client through the proxy:

```bash
export ANTHROPIC_BASE_URL=http://localhost:20129/v1
export ANTHROPIC_DEFAULT_SONNET_MODEL=ccd/claudible-claude-haiku-4-5-20251001
claude -p hi
```

**Result**: Success. The proxy now correctly identifies Claude Code traffic and preserves the required identity markers for `claudible.io`.
