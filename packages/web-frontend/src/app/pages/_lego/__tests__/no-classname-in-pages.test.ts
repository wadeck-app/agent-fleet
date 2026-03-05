import { readFileSync } from 'fs';
import { glob } from 'glob';
import { describe, expect, it } from 'vitest';

/**
 * ===========================================================================================
 * NO CLASSNAME IN PAGES TEST
 * ===========================================================================================
 *
 * Ensures that page files in the Lego framework do not contain className or style attributes.
 * Layout should be managed by framework components, not by pages.
 *
 * This rule applies to ALL approaches (A1-A6) with no exceptions.
 *
 * ===========================================================================================
 */

describe('Lego pages have no className', () => {
	it('should not have className or style attributes in any page file', async () => {
		const pageFiles = await glob('src/app/pages/_lego/**/*Page.tsx', {
			cwd: 'packages/web-frontend',
			absolute: true,
		});

		const violations: Array<{ file: string; issues: string[] }> = [];

		for (const file of pageFiles) {
			const content = readFileSync(file, 'utf-8');
			const issues: string[] = [];

			// Check for className attribute
			if (content.includes('className=')) {
				issues.push('contains className attribute');
			}

			// Check for style attribute
			if (content.includes('style=')) {
				issues.push('contains style attribute');
			}

			if (issues.length > 0) {
				violations.push({
					file: file.replace(/\\/g, '/'),
					issues,
				});
			}
		}

		if (violations.length > 0) {
			const violationMessages = violations
				.map(v => `  ${v.file}:\n    - ${v.issues.join('\n    - ')}`)
				.join('\n');
			throw new Error(
				`Found className/style violations in ${violations.length} page(s):\n\n${violationMessages}\n\nLayout should be managed by framework components, not by pages.`
			);
		}

		expect(violations).toEqual([]);
	});
});
