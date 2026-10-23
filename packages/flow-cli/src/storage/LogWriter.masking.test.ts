import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ExecutionMasks } from '../secrets/ExecutionMasks';
import { SecretMasker } from '../secrets/SecretMasker';
import { LogWriter } from './LogWriter';

// Built at runtime from parts: a literal would trip secret scanners on the source file.
const TOKEN = ['tk', '_Ab3xY9', 'Q7z'].join('');

describe('LogWriter masking', () => {
	let dir: string;
	let writer: LogWriter;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-writer-mask-'));
		const masks = new ExecutionMasks();
		masks.register('exec-1', new SecretMasker(new Map([['API_TOKEN', TOKEN]])));
		writer = new LogWriter(dir, 30, masks);
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	function logText(): string {
		return fs
			.readdirSync(dir)
			.map(file => fs.readFileSync(path.join(dir, file), 'utf8'))
			.join('');
	}

	it('masks step log messages of an execution with secrets', () => {
		writer.write('exec-1', 'step', {
			id: 'e',
			timestamp: Date.now(),
			level: 'info',
			message: `out ${TOKEN}`,
			eventType: 'result',
		});
		expect(logText()).toContain('out [secret:API_TOKEN]');
		expect(logText()).not.toContain(TOKEN);
	});

	it('masks execution-level messages (errors, lifecycle)', () => {
		writer.writeExecution('exec-1', `Step failed: ${TOKEN}`, 'error');
		expect(logText()).toContain('Step failed: [secret:API_TOKEN]');
		expect(logText()).not.toContain(TOKEN);
	});

	it('leaves other executions untouched', () => {
		writer.writeExecution('exec-2', `same ${TOKEN}`);
		expect(logText()).toContain(TOKEN);
	});
});
