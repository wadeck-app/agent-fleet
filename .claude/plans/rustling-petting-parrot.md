# Plan: Fix E2E Backend Startup Performance

**Date**: 2026-02-27

## Context

During E2E tests, the global setup spawns 5 backend workers **in parallel**, each using `tsx src/server.ts` (TypeScript compilation on-the-fly). On the current machine, each startup takes >5s, causing cascading failures: timeout → kill → retry on next port → repeat. This hammers the CPU with multiple tsx processes simultaneously and makes the machine nearly unusable during test startup.

**Root cause**: `tsx` recompiles the entire TypeScript codebase on every process start. With 5 workers in parallel, that's 5× simultaneous compilations.

**Correct fix**: Build once (esbuild, ~10s total), start N workers from pre-compiled JS (~1s each) — same pattern already used by `npm run start`.

## Approach

### 1. Support a separate E2E output target in `build.mjs`

**File**: `packages/web-backend/build.mjs`

Parameterize the output file via env var:
```javascript
outfile: process.env.OUTFILE || 'dist/server',
```

### 2. Add scripts to `packages/web-backend/package.json`

- Add `"build:for-e2e": "cross-env OUTFILE=dist/server-test node build.mjs"` — produces `dist/server-test`
- Add `"start:only-for-e2e": "node dist/server-test"` — used by each E2E worker
- Fix existing bug: `"start"`, `"start:library"`, `"start:remote"` reference `dist/server.js` but esbuild produces `dist/server` (no extension) — fix all three

### 3. Pre-build backend in global setup (once for all workers)

**File**: `packages/e2e-web/playwright-hooks/global-setup-web-server.ts`

At the top of `globalSetupWebServer()`, before `serverPromises`, add:
```typescript
console.log('🔨 Building backend for E2E (once for all workers)...');
await execAsync('npm run build:for-e2e --workspace=web-backend', { cwd: projectRoot });
console.log('✅ Backend built successfully (dist/server-test)');
```
`execAsync` is already imported.

### 4. Switch workers to pre-compiled backend

**File**: `packages/e2e-web/playwright-hooks/global-setup-web-server.ts`

In `startServerOnAvailablePort`, change:
```typescript
const command = 'npm run dev:only-for-e2e --workspace=web-backend';
```
to:
```typescript
const command = 'npm run start:only-for-e2e --workspace=web-backend';
```

### 5. Fix the timeout (currently 20s — wrong band-aid)

A compiled backend starts in ~1-2s. Set timeout to **10s** as safe buffer.

**File**: `packages/e2e-web/playwright-hooks/global-setup-web-server.ts` line ~281

```typescript
}, 10_000); // 10s: compiled backend starts in <2s, 10s covers slow machines
```

### 6. Add `dist/server-test*` to .gitignore

**File**: `packages/web-backend/.gitignore` (or root `.gitignore`)

Add:
```
dist/server-test
dist/server-test.map
```

## Files to Modify

| File | Change |
|------|--------|
| `packages/web-backend/build.mjs` | `outfile: process.env.OUTFILE \|\| 'dist/server'` |
| `packages/web-backend/package.json` | Add `build:for-e2e` + `start:only-for-e2e`, fix `dist/server.js` → `dist/server` (3 scripts) |
| `packages/e2e-web/playwright-hooks/global-setup-web-server.ts` | Add build step + switch to `start:only-for-e2e` + fix timeout to 10s |
| `.gitignore` (root or web-backend) | Add `dist/server-test*` |

## Verification

1. `npm run test:e2e` — global setup logs a single build step, then 5 workers start cleanly in <3s each
2. No timeout errors, no CPU storm
3. `dist/server` (production) remains untouched during E2E runs
