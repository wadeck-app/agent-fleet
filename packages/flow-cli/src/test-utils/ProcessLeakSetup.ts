// Vitest setup file (runs in every test file): fails the file if a process it armed the guard for outlived its teardown.
// Files that never arm the guard pay nothing: no process listing is done for them.
import { afterAll } from 'vitest';

import { processLeakGuard } from './ProcessLeakGuard';

afterAll(async () => {
	await processLeakGuard.verify();
	// Listing the machine's processes takes seconds on Windows; the default hook timeout would cut it short.
}, 60_000);
