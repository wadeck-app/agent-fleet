import { Command } from 'commander';
import * as path from 'node:path';

import { registerShowCommand } from './ShowCommand';

const FIXTURES_DIR = path.resolve(__dirname, '../../test-utils/fixtures');
const SIMPLE_FLOW = path.join(FIXTURES_DIR, 'simple-flow.yml');

describe('ShowCommand', () => {
	let consoleSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(process, 'exit').mockImplementation(() => {
			throw new Error('exit');
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	const runShow = (file: string): void => {
		const program = new Command();
		program.exitOverride();
		registerShowCommand(program);
		program.parse(['node', 'test', 'show', file]);
	};

	it('renders table for valid flow (console.log called, output contains flow id)', () => {
		runShow(SIMPLE_FLOW);

		expect(consoleSpy).toHaveBeenCalled();
		const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
		expect(allOutput).toContain('simple-flow');
	});

	it('output contains all step IDs', () => {
		runShow(SIMPLE_FLOW);

		const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
		expect(allOutput).toContain('step-one');
		expect(allOutput).toContain('step-two');
		expect(allOutput).toContain('step-approve');
	});

	it('user_intervention step shows (!) marker for blocking step', () => {
		runShow(SIMPLE_FLOW);

		const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
		expect(allOutput).toContain('step-approve (!)');
	});

	it('output contains script type for step-one', () => {
		runShow(SIMPLE_FLOW);

		const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
		expect(allOutput).toContain('script');
	});

	it('output contains haiku model name for step-two', () => {
		runShow(SIMPLE_FLOW);

		const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
		expect(allOutput).toContain('haiku');
	});
});
