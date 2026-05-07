# Rules

**Core:** Default to Bun. Do not use Node.js, npm, yarn, or pnpm.
**Rule:** Always use the explore agent to find relevant files before implementing.

## Tooling Replacements

- **Run:** `bun <file>` (No node/ts-node)
- **Install/Execute:** `bun install`, `bun run <script>`, `bunx <cmd>`
- **Test:** `bun test` (No jest/vitest)
- **Build:** `bun build <file>` (No webpack/esbuild/vite)
- **Env:** Bun auto-loads `.env` (No dotenv)

## API Replacements

- **Server & WS:** `Bun.serve()` (No express, no ws)
- **Database:** `bun:sqlite` (SQLite), `Bun.sql` (Postgres), `Bun.redis` (Redis) (No better-sqlite3, pg, postgres.js, ioredis)
- **Files:** `Bun.file()` (Prefer over node:fs)
- **Shell:** `Bun.$` (No execa)

## Testing

```ts
import { test, expect } from "bun:test";
```
