# 2026-03-02 — Lego Visual Cross-Approach Regression Tests

## Context

The Lego experiment has 4 parallel approaches (A1–A4) implementing the same DataTable CRUD UI.
The requirement is that all 4 approaches render **pixel-identical** output.
Currently this is verified manually via `agent-browser` screenshots.
Goal: automate that comparison so any visual divergence between approaches is caught immediately.

Two residual visual differences must be fixed **before** establishing baselines:

1. A2 `ViewDataTable`: `placeholder="Search products..."` → `"Search..."`
2. A1/A2/A3 footer shows `"Showing 1 to 6 of 12 items"` instead of `"1 to 10 of 12"` — backend Products API returns `pageSize: 6` in pagination response regardless of what the frontend requested

---

## Existing infrastructure

| File                                                    | Role                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| `packages/e2e-web/playwright.config.visual.ts`          | Storybook-based visual regression (component-level)        |
| `packages/e2e-web/playwright.config.integration.ts`     | E2E app tests (complex: per-worker backend, dynamic ports) |
| `packages/e2e-web/playwright-hooks/hooks-web-server.ts` | Runtime fixture: dynamic baseURL + API routing per-worker  |
| `packages/e2e-web/test-visual/`                         | Home of Storybook visual tests + snapshots                 |

The new tests need a **running app with real data** (frontend + backend), but NOT the full integration-test isolation. They are **dev-only** tests (not CI-graded), so `reuseExistingServer: true` is appropriate.

---

## Implementation Plan

### Phase 1 — Fix remaining visual differences (frontend-dev agent)

**File 1**: `packages/web-frontend/src/app/pages/_lego/_2_context-provider/_framework/ViewDataTable.tsx`

- Change `placeholder="Search products..."` → `placeholder="Search..."`

**File 2 (investigation + fix)**: Backend `packages/web-backend/src/services/ProductsService.ts`

- Root cause: `pagination.pageSize` in response = 6 (hardcoded default) instead of echoing the requested pageSize
- Pattern to follow: `packages/web-backend/src/services/BooksService.ts`
- Fix: ensure pagination response reflects the actual `pageSize` from the request params

Run `/check` and `/run-test` after these fixes. All 192 unit tests must still pass.

---

### Phase 2 — New Playwright config (frontend-dev agent)

**New file**: `packages/e2e-web/playwright.config.lego-visual.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const projectRoot = path.resolve(__dirname, '../..');

export default defineConfig({
	testDir: path.resolve(projectRoot, 'packages/e2e-web/test-lego-visual'),
	outputDir: path.resolve(projectRoot, 'packages/e2e-web/test-lego-visual/_results/_misc'),
	timeout: 30_000,
	fullyParallel: false, // serial within describe blocks must be respected
	workers: 1, // single worker: avoids port/state race conditions
	retries: 0,
	reporter: [['html', { outputFolder: 'test-lego-visual/_results/html', open: 'on-failure' }], ['list']],
	use: {
		baseURL: `http://localhost:${process.env.LEGO_APP_PORT || 5310}`,
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
		actionTimeout: 10_000,
		navigationTimeout: 15_000,
	},
	snapshotPathTemplate: '{testDir}/{testFilePath}--snapshots/{arg}-{projectName}{ext}',
	projects: [
		{
			name: 'lego-visual',
			use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
			expect: {
				toHaveScreenshot: {
					maxDiffPixelRatio: 0.002,
					maxDiffPixels: 100,
					threshold: 0.2,
					animations: 'disabled',
				},
			},
		},
	],
	// Reuse the already-running dev server (dev-only, not CI)
	webServer: {
		command: 'echo "Dev server expected to be already running"',
		url: `http://localhost:${process.env.LEGO_APP_PORT || 5310}`,
		reuseExistingServer: true,
	},
});
```

---

### Phase 3 — Test file (frontend-dev agent)

**New file**: `packages/e2e-web/test-lego-visual/lego.cross-approach.visual.ts`

**Key design decisions:**

- A1 is the **reference** (its screenshots are the stored baselines)
- A2/A3/A4 compare against the **same snapshot file** as A1
- `test.describe.serial` ensures A1 runs before comparators within each scenario
- Updating baselines: run `--update-snapshots --grep "⚡"` (only A1 "⚡ baseline" tests match)
- Normal run: all 4 approaches run; A2/A3/A4 compare against A1's stored PNG

**Scenarios covered:** S1 (Simple Table), S3 (Full Featured)

```typescript
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Wait for table data to be fully rendered
async function waitForTableData(page: Page): Promise<void> {
	await page.waitForLoadState('networkidle');
	await page.locator('tbody tr').first().waitFor({ state: 'visible', timeout: 10_000 });
}

const APPROACHES = [
	{ id: 1, name: 'widget-isolated' },
	{ id: 2, name: 'context-provider' },
	{ id: 3, name: 'feature-hooks' },
	{ id: 4, name: 'context-children' },
] as const;

const SCENARIOS = [
	{ id: 's1', name: 'Simple Table' },
	{ id: 's3', name: 'Full Featured' },
] as const;

for (const scenario of SCENARIOS) {
	test.describe.serial(`${scenario.id.toUpperCase()} — ${scenario.name}`, () => {
		// A1 establishes the baseline — only this test runs with --update-snapshots
		test(`⚡ A1 baseline (${APPROACHES[0].name})`, async ({ page }) => {
			await page.goto(`/lego/1/${scenario.id}`);
			await waitForTableData(page);
			await expect(page).toHaveScreenshot([scenario.id, 'reference.png']);
		});

		// A2/A3/A4 compare against A1's reference
		for (const approach of APPROACHES.slice(1)) {
			test(`A${approach.id} matches reference (${approach.name})`, async ({ page }) => {
				await page.goto(`/lego/${approach.id}/${scenario.id}`);
				await waitForTableData(page);
				await expect(page).toHaveScreenshot([scenario.id, 'reference.png']);
			});
		}
	});
}
```

---

### Phase 4 — NPM scripts

**Update** `packages/e2e-web/package.json` — add:

```json
"test:lego-visual": "playwright test --config=playwright.config.lego-visual.ts",
"test:lego-visual:update-baseline": "playwright test --config=playwright.config.lego-visual.ts --update-snapshots --grep=\"⚡\"",
"test:lego-visual:ui": "playwright test --config=playwright.config.lego-visual.ts --ui"
```

---

### Phase 5 — Establish baselines and verify

```bash
# 1. Ensure dev server is running (both frontend + backend)
cd packages/web-frontend && npm run dev   # in one terminal
cd packages/web-backend && npm run dev    # in another

# 2. Establish A1 baselines
cd packages/e2e-web && npm run test:lego-visual:update-baseline

# 3. Run full cross-approach comparison
npm run test:lego-visual

# Expected: 8 tests pass (4 approaches × 2 scenarios)
```

---

## Snapshot directory structure

```
packages/e2e-web/test-lego-visual/
  lego.cross-approach.visual.ts
  lego.cross-approach.visual.ts--snapshots/
    s1/
      reference-lego-visual.png    ← A1 baseline for S1
    s3/
      reference-lego-visual.png    ← A1 baseline for S3
  _results/
    html/
```

---

## Workflow for future changes

| Intent                          | Command                                                    |
| ------------------------------- | ---------------------------------------------------------- |
| Verify all 4 match              | `npm run test:lego-visual`                                 |
| Intentional visual change in A1 | `npm run test:lego-visual:update-baseline` then re-run all |
| Debug a failure                 | `npm run test:lego-visual:ui`                              |

---

## Execution order

```
Phase 1 — frontend-dev agent:
  - Fix A2 placeholder
  - Fix backend pagination (Products service)
  - /check + /run-test → must pass

Phase 2+3+4 — frontend-dev agent (same agent):
  - Create playwright.config.lego-visual.ts
  - Create test-lego-visual/ + test file
  - Add npm scripts

Phase 5 — manual or agent-browser:
  - Start dev servers
  - npm run test:lego-visual:update-baseline  (creates A1 baselines)
  - npm run test:lego-visual                  (verifies all 4 match)
```
