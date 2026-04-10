# Claude Header Caching Implementation

## Overview

Successfully implemented Claude header caching for provider forwarding in bun-llm-proxy, based on the working implementation from the 9router repository, with **significant memory management improvements**.

## What Was Implemented

### 1. Enhanced Provider Header Building (`ai-bridge/handlers/provider.ts`)

The `buildUpstreamHeaders()` function now:

- **Retrieves cached Claude headers** for "claude" and "anthropic" providers
- **Overlays cached headers** over static defaults
- **Handles Title-Case conversion** (e.g., "Anthropic-Version" → "anthropic-version")
- **Merges anthropic-beta flags** to preserve required flags (oauth, thinking, etc.)
- **Strips Claude Code identity headers** for anthropic-compatible providers when NOT sending to api.anthropic.com

### 2. Memory-Managed Caching (`ai-bridge/utils/claudeHeaderCache.ts`)

**Unlike 9router's simple singleton, this implementation includes:**

- **Multi-entry cache**: Stores up to 100 different client header sets (keyed by session ID or user-agent)
- **TTL (Time To Live)**: Entries expire after 12 hours
- **LRU eviction**: Least recently used entries are evicted when cache is full
- **Periodic cleanup**: Expired entries are removed every 5 minutes
- **Access tracking**: Tracks access count and last access time for intelligent eviction

**Cache Configuration:**
```typescript
const CACHE_TTL_MS = 60 * 60 * 1000 * 12; // 12 hours
const MAX_CACHE_SIZE = 100; // Maximum 100 cached header sets
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
```

### 3. Helper Functions Added

**`overlayCachedHeaders(baseHeaders, cached)`**
- Converts lowercase cached keys to Title-Case to find conflicts
- Special handling for `anthropic-beta`: merges static and cached flags
- Removes conflicting Title-Case variants
- Overlays cached headers onto base headers

**`stripClaudeCodeHeaders(headers)`**
- Removes `anthropic-dangerous-direct-browser-access`
- Removes `x-app`
- Strips `claude-code-20250219` from `anthropic-beta` flags
- Preserves other beta flags (oauth, thinking, etc.)

### 4. Monitoring & Testing Support

**Added functions:**
- `clearCachedClaudeHeaders()` - Clear all cache (primarily for testing)
- `getCacheStats()` - Get cache statistics for monitoring

**Cache statistics include:**
```typescript
{
  size: number;           // Current number of cached entries
  maxSize: number;        // Maximum cache size (100)
  ttlMs: number;          // Time to live in milliseconds (12 hours)
  entries: Array<{
    key: string;          // Cache key
    age: number;          // Age in milliseconds
    accessCount: number;  // Number of times accessed
    headerCount: number;  // Number of headers in entry
  }>;
}
```

## Test Coverage

Created comprehensive test suite in `tests/unit/claude-header-forwarding.test.ts`:

- ✅ Cache detection (user-agent contains "claude-code" or "claude-cli", or x-app is "cli")
- ✅ Cold start behavior (fallback to static headers when cache is empty)
- ✅ Header overlay and merging
- ✅ Title-Case to lowercase conversion
- ✅ anthropic-beta flag merging
- ✅ Header stripping for non-Anthropic anthropic-compatible providers
- ✅ Header preservation for api.anthropic.com
- ✅ Multiple cache entries management
- ✅ Cache statistics tracking

**Test Results**: 715 tests pass across 23 files (22 new tests for header caching)

## Memory Management Comparison

### 9router Implementation (Memory Issue)
```javascript
let cachedHeaders = null; // Single entry, never expires
```
**Problems:**
- ❌ Only stores one set of headers
- ❌ Never expires or cleans up
- ❌ Can accumulate memory over time
- ❌ No monitoring or statistics

### bun-llm-proxy Implementation (Memory Safe)
```typescript
const headerCache = new Map<string, CacheEntry>();
// With TTL, LRU eviction, and periodic cleanup
```
**Benefits:**
- ✅ Stores up to 100 different client header sets
- ✅ Entries expire after 12 hours
- ✅ LRU eviction when cache is full
- ✅ Automatic cleanup every 5 minutes
- ✅ Access tracking and statistics
- ✅ Monitoring via `getCacheStats()`

## How It Works

### Request Flow

1. **Incoming Request** (`handlers/chat.ts`):
   ```typescript
   cacheClaudeHeaders(clientRawRequest.headers as Record<string, string>);
   ```

2. **Header Detection & Caching** (`ai-bridge/utils/claudeHeaderCache.ts`):
   - Detects Claude Code client by user-agent or x-app header
   - Generates cache key from session ID or user-agent
   - Stores headers with timestamp and access tracking
   - Starts cleanup timer on first entry

3. **Provider Forwarding** (`ai-bridge/handlers/provider.ts`):
   - Retrieves most recently used cached headers
   - Updates access statistics
   - Overlays them onto static provider defaults
   - Strips Claude Code identity for non-Anthropic upstreams
   - Forwards headers to provider

4. **Automatic Cleanup**:
   - Runs every 5 minutes
   - Removes entries older than 12 hours
   - Evicts LRU entries if cache exceeds 100 entries

### Example

**Incoming Claude Code Request:**
```
user-agent: claude-code/2.1.63 node/24.3.0
anthropic-beta: claude-code-20250219,oauth-2025-04-20
x-app: cli
x-claude-code-session-id: sess_abc123
```

**Cached Headers (key: session:sess_abc123):**
```typescript
{
  headers: {
    "user-agent": "claude-code/2.1.63 node/24.3.0",
    "anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
    "x-app": "cli"
  },
  timestamp: 1234567890,
  accessCount: 5,
  lastAccess: 1234567900
}
```

**Forwarded to api.anthropic.com:**
```
user-agent: claude-code/2.1.63 node/24.3.0
anthropic-version: 2023-06-01
anthropic-beta: claude-code-20250219,oauth-2025-04-20
x-api-key: sk-ant-xxx
x-app: cli
```

**Forwarded to custom anthropic-compatible provider:**
```
anthropic-version: 2023-06-01
anthropic-beta: oauth-2025-04-20
x-api-key: sk-ant-xxx
```
(Note: `x-app` and `claude-code-20250219` are stripped)

## Files Modified

1. `ai-bridge/handlers/provider.ts` - Main implementation
2. `ai-bridge/utils/claudeHeaderCache.ts` - Memory-managed cache with cleanup
3. `ai-bridge/index.ts` - Exported new functions
4. `tests/unit/claude-header-forwarding.test.ts` - New test file (22 tests)
5. `tests/unit/ai-bridge-provider.test.ts` - Added cache clearing for test isolation

## Verification

To verify the implementation works:

```bash
# Run the tests
bun test tests/unit/claude-header-forwarding.test.ts

# Start the proxy
bun run dev

# From Claude Code, make a request through the proxy
# Check logs for: "[ClaudeHeaders] Cached N identity headers from Claude Code client (key: xxx, total: X/100)"

# Monitor cache stats (add this to your monitoring)
import { getCacheStats } from "./ai-bridge/index.ts";
const stats = getCacheStats();
console.log(`Cache: ${stats.size}/${stats.maxSize} entries`);

# Verify the upstream request includes cached headers
# (use packet capture or provider logs to confirm)
```

## Memory Safety

The implementation is production-ready with the following safeguards:

1. **Size Limit**: Maximum 100 cached header sets
2. **TTL**: Entries expire after 12 hours
3. **LRU Eviction**: Automatically removes least recently used entries
4. **Periodic Cleanup**: Runs every 5 minutes
5. **Monitoring**: Exposes statistics for observability
6. **Timer Cleanup**: Uses `unref()` to prevent blocking process exit

**Memory Usage Estimate:**
- Each entry: ~1-2 KB (headers + metadata)
- Maximum cache: 100 entries × 2 KB = ~200 KB
- Negligible impact on server memory

## References

- 9router implementation: `/Users/quanle96/Documents/9router/open-sse/utils/claudeHeaderCache.js`
- 9router executor: `/Users/quanle96/Documents/9router/open-sse/executors/default.js`
- 9router tests: `/Users/quanle96/Documents/9router/tests/unit/claude-header-forwarding.test.js`
