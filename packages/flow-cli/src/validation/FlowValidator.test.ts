import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { validateFlowFile } from './FlowValidator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../test-utils/fixtures');

describe('FlowValidator (CLI adapter)', () => {
	it('returns exit 0 for valid flow', () => {
		const result = validateFlowFile(path.join(fixturesDir, 'hello-world.yml'));
		expect(result.exit).toBe(0);
	});

	it('returns exit 1 for flow with validation errors', () => {
		const result = validateFlowFile(path.join(fixturesDir, 'invalid-flow.yml'));
		// empty steps is a validation error
		expect(result.exit).toBe(1);
		if (result.exit === 1) {
			expect(result.errors.length).toBeGreaterThan(0);
			expect(result.errors[0]).toHaveProperty('type');
			expect(result.errors[0]).toHaveProperty('message');
			expect(result.errors[0]).toHaveProperty('path');
		}
	});

	it('returns exit 2 for missing file', () => {
		const result = validateFlowFile('/nonexistent/path/flow.yml');
		expect(result.exit).toBe(2);
	});

	it('returns exit 3 for malformed YAML', async () => {
		const os = await import('node:os');
		const crypto = await import('node:crypto');
		const fs = await import('node:fs');
		const tmpFile = path.join(os.tmpdir(), `bad-yaml-${crypto.randomUUID()}.yml`);
		fs.writeFileSync(tmpFile, 'invalid: yaml: [unclosed');
		try {
			const result = validateFlowFile(tmpFile);
			expect(result.exit).toBe(3);
			if (result.exit === 3) {
				expect(result.errors[0]?.type).toBe('parse_error');
			}
		} finally {
			fs.unlinkSync(tmpFile);
		}
	});
});
