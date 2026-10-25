import { UpdateManager } from '@wadeck-app/shared-cli';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VERSION } from '../cli/version.js';
import { startPeriodicUpdateCheck } from './startPeriodicUpdateCheck.js';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('startPeriodicUpdateCheck', () => {
	it('passes the CLI version to scheduleBackgroundUpdate so shared-cli refuses to spawn for a dev build', () => {
		const schedule = vi.spyOn(UpdateManager.prototype, 'scheduleBackgroundUpdate').mockImplementation(() => {});
		// A directory without config.yml: readUpdateConfig falls back to its defaults.
		const timer = startPeriodicUpdateCheck('/nonexistent-flow-daemon-dir');
		clearInterval(timer);

		expect(schedule).toHaveBeenCalledTimes(1);
		expect(schedule).toHaveBeenCalledWith(expect.any(String), 'flow-updater.cjs', VERSION);
	});
});
