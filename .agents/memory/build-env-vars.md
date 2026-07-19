---
name: Build Env Vars
description: PlaySyncer requires PORT and BASE_PATH env vars for production build; tsc --build needed for typecheck.
---

# Build Env Vars

## Production Build
The Vite config (`artifacts/playsyncer/vite.config.ts`) validates required env vars at config load time.

Required for `pnpm --filter @workspace/playsyncer run build`:
- `PORT` — any value works (e.g. `PORT=3000`)
- `BASE_PATH` — the artifact's preview path (e.g. `BASE_PATH=/playsyncer`)

## Typecheck
The playsyncer `tsconfig.json` uses project references to `lib/api-client-react`. Running `tsc --noEmit` fails unless the referenced project is already built.

Use `npx tsc --build` in `artifacts/playsyncer/` to build references first, then typecheck.

**Why:** The `exports` field in `lib/api-client-react/package.json` points to `./src/index.ts` (source), so TypeScript needs the compiled declaration files from `lib/api-client-react/dist/` to resolve types.
