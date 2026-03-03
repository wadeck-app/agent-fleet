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
