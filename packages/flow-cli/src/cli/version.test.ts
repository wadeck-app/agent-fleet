import { describe, it, expect } from 'vitest';
import { VERSION } from './version.js';

describe('VERSION', () => {
	it('matches CalVer format YYYY.MM.DD-HHmmss-count-hash', () => {
		expect(VERSION).toMatch(/^\d{4}\.\d{2}\.\d{2}-\d{6}-\d+-[0-9a-zA-Z]+/);
	});
});
