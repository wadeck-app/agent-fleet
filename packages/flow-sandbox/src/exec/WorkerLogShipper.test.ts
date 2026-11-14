import { describe, expect, it } from 'vitest';

import { FakeClock } from '../FakeClock';
import { FakeScheduler } from '../FakeScheduler';
import {
	SHIPPER_BACKLOG_MAX_CHARS,
	SHIPPER_FLUSH_INTERVAL_MS,
	SHIPPER_MAX_CHARS_PER_SECOND,
	WORKER_LOG_CHUNK_MAX_CHARS,
	type WorkerLogMessage,
	WorkerLogShipper,
	type WritableLike,
} from './WorkerLogShipper';

class FakeStream implements WritableLike {
	readonly written: unknown[] = [];
	write = (...args: never[]): unknown => {
		this.written.push(args[0]);
		return true;
	};
}

function setup() {
	const clock = new FakeClock(1_000_000);
	const scheduler = new FakeScheduler(clock);
	const failures: unknown[] = [];
	const shipper = new WorkerLogShipper({ clock, scheduler, onSendFailure: error => failures.push(error) });
	const stdout = new FakeStream();
	const stderr = new FakeStream();
	const sent: WorkerLogMessage[] = [];
	const send = (message: WorkerLogMessage): void => {
		sent.push(message);
	};
	return { clock, scheduler, shipper, stdout, stderr, sent, send, failures };
}

describe('WorkerLogShipper', () => {
	it('lets the original write run and returns its result untouched', () => {
		const { shipper, stdout, stderr } = setup();
		const originalStderrWrite = stderr.write;
		shipper.install(stdout, stderr);

		expect(stderr.write('line\n' as never)).toBe(true);
		expect(stderr.written).toEqual(['line\n']);

		shipper.uninstall();
		expect(stderr.write).toBe(originalStderrWrite);
	});

	it('sends nothing before attach, then sends what was kept with the right stream', () => {
		const { shipper, stdout, stderr, sent, send, scheduler } = setup();
		shipper.install(stdout, stderr);
		stdout.write('out\n' as never);
		stderr.write('err\n' as never);
		scheduler.advance(SHIPPER_FLUSH_INTERVAL_MS * 4);
		expect(sent).toEqual([]);

		shipper.attach(send);

		expect(sent).toEqual([
			{ type: 'worker_log', stream: 'stdout', text: 'out\n' },
			{ type: 'worker_log', stream: 'stderr', text: 'err\n' },
		]);
	});

	it('batches what is written after attach into the next flush, not one frame per write at once', () => {
		const { shipper, stdout, stderr, sent, send, scheduler } = setup();
		shipper.install(stdout, stderr);
		shipper.attach(send);
		stderr.write('a\n' as never);
		expect(sent).toEqual([]);

		scheduler.advance(SHIPPER_FLUSH_INTERVAL_MS);

		expect(sent).toEqual([{ type: 'worker_log', stream: 'stderr', text: 'a\n' }]);
	});

	it('reads bytes as UTF-8 and ignores empty and non-text chunks', () => {
		const { shipper, stdout, stderr, sent, send } = setup();
		shipper.install(stdout, stderr);
		stderr.write(Buffer.from('é\n') as never);
		stderr.write('' as never);
		stderr.write(42 as never);

		shipper.attach(send);

		expect(sent).toEqual([{ type: 'worker_log', stream: 'stderr', text: 'é\n' }]);
	});

	it('splits a text into messages of at most 16K characters', () => {
		const { shipper, stdout, stderr, sent, send } = setup();
		shipper.install(stdout, stderr);
		stderr.write('x'.repeat(WORKER_LOG_CHUNK_MAX_CHARS * 2 + 5) as never);

		shipper.attach(send);

		expect(sent.map(message => message.text.length)).toEqual([
			WORKER_LOG_CHUNK_MAX_CHARS,
			WORKER_LOG_CHUNK_MAX_CHARS,
			5,
		]);
	});

	it('keeps only the newest 64K characters before attach and reports the rest as dropped on the first message', () => {
		const { shipper, stdout, stderr, sent, send } = setup();
		shipper.install(stdout, stderr);
		stderr.write('a'.repeat(SHIPPER_BACKLOG_MAX_CHARS) as never);
		stderr.write('b'.repeat(10) as never);

		shipper.attach(send);

		// The oldest whole write goes (as in flow-cli's shipper), and what went is counted on the first message.
		expect(sent).toEqual([
			{ type: 'worker_log', stream: 'stderr', text: 'b'.repeat(10), dropped: SHIPPER_BACKLOG_MAX_CHARS },
		]);
	});

	it('caps what leaves at 64K characters per second and sends the rest in the next second', () => {
		const { shipper, stdout, stderr, sent, send, scheduler } = setup();
		shipper.install(stdout, stderr);
		shipper.attach(send);
		const chunk = 'y'.repeat(SHIPPER_BACKLOG_MAX_CHARS);
		stderr.write(chunk as never);
		scheduler.advance(SHIPPER_FLUSH_INTERVAL_MS);
		expect(sent.reduce((sum, message) => sum + message.text.length, 0)).toBe(SHIPPER_MAX_CHARS_PER_SECOND);

		stderr.write('z'.repeat(100) as never);
		scheduler.advance(SHIPPER_FLUSH_INTERVAL_MS);
		// Same second: nothing more may leave.
		expect(sent.reduce((sum, message) => sum + message.text.length, 0)).toBe(SHIPPER_MAX_CHARS_PER_SECOND);

		scheduler.advance(1000);
		expect(sent.map(message => message.text).join('')).toBe(chunk + 'z'.repeat(100));
	});

	it('counts what a failed send lost, reports the failure once, and keeps going', () => {
		const { shipper, stdout, stderr, sent, scheduler } = setup();
		shipper.install(stdout, stderr);
		let failing = true;
		shipper.attach(message => {
			if (failing) throw new Error('socket is closed');
			sent.push(message);
		});
		stderr.write('lost\n' as never);
		scheduler.advance(SHIPPER_FLUSH_INTERVAL_MS);
		stderr.write('lost again\n' as never);
		scheduler.advance(SHIPPER_FLUSH_INTERVAL_MS);
		failing = false;
		stderr.write('kept\n' as never);
		scheduler.advance(SHIPPER_FLUSH_INTERVAL_MS);

		expect(sent).toEqual([{ type: 'worker_log', stream: 'stderr', text: 'kept\n', dropped: 16 }]);
	});

	it('reports a send failure once, through the callback and not through the watched streams', () => {
		const { shipper, stdout, stderr, send, scheduler, failures } = setup();
		shipper.install(stdout, stderr);
		shipper.attach(() => {
			throw new Error('socket is closed');
		});
		stderr.write('a\n' as never);
		scheduler.advance(SHIPPER_FLUSH_INTERVAL_MS);
		stderr.write('b\n' as never);
		scheduler.advance(SHIPPER_FLUSH_INTERVAL_MS);

		expect(failures).toHaveLength(1);
		expect(String(failures[0])).toContain('socket is closed');
		expect(stderr.written).toEqual(['a\n', 'b\n']);
		expect(send).toBeTypeOf('function');
	});

	it('keeps output again after detach, and a pending flush does not fire', () => {
		const { shipper, stdout, stderr, sent, send, scheduler } = setup();
		shipper.install(stdout, stderr);
		shipper.attach(send);
		stderr.write('a\n' as never);
		shipper.detach();
		scheduler.advance(SHIPPER_FLUSH_INTERVAL_MS * 2);
		expect(sent).toEqual([]);
		expect(scheduler.pendingCount).toBe(0);

		shipper.attach(send);
		expect(sent).toEqual([{ type: 'worker_log', stream: 'stderr', text: 'a\n' }]);
	});

	it('refuses a second install', () => {
		const { shipper, stdout, stderr } = setup();
		shipper.install(stdout, stderr);

		expect(() => shipper.install(stdout, stderr)).toThrow(/already installed/);
	});
});
