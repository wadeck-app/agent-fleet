import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_WORKER_FRAME_BYTES } from '../ipc/WorkerFrameLimit';
import { serializeWorkerFrame } from './WorkerFrame';
import {
	SHIPPER_BACKLOG_MAX_CHARS,
	SHIPPER_FLUSH_INTERVAL_MS,
	SHIPPER_MAX_CHARS_PER_SECOND,
	WorkerOutputShipper,
} from './WorkerOutputShipper';

type Sent = { type: 'worker_log'; stream: 'stdout' | 'stderr'; text: string; dropped?: number };

function fakeStream() {
	const written: string[] = [];
	const stream = {
		write: (chunk: unknown): boolean => {
			written.push(String(chunk));
			return true;
		},
	};
	return { stream, written };
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

function setup(options: ConstructorParameters<typeof WorkerOutputShipper>[0] = {}) {
	const out = fakeStream();
	const err = fakeStream();
	const shipper = new WorkerOutputShipper({ now: () => Date.now(), ...options });
	shipper.install(out.stream as never, err.stream as never);
	const sent: Sent[] = [];
	return { shipper, out, err, sent, send: (message: Sent) => void sent.push(message) };
}

describe('WorkerOutputShipper', () => {
	it('leaves the terminal output exactly as it is: the original write runs and its result is returned', () => {
		const { out, err } = setup();
		expect(out.stream.write('hello\n')).toBe(true);
		err.stream.write('oops\n');
		expect(out.written).toEqual(['hello\n']);
		expect(err.written).toEqual(['oops\n']);
	});

	it('sends nothing until the daemon enabled shipping, then sends what was printed meanwhile and what follows', () => {
		const { shipper, out, err, sent, send } = setup();
		out.stream.write('banner\n');
		err.stream.write('[warn] early\n');
		vi.advanceTimersByTime(5000);
		expect(sent).toEqual([]);

		shipper.attach(send);
		expect(sent).toEqual([
			{ type: 'worker_log', stream: 'stdout', text: 'banner\n' },
			{ type: 'worker_log', stream: 'stderr', text: '[warn] early\n' },
		]);

		out.stream.write('step started\n');
		expect(sent).toHaveLength(2);
		vi.advanceTimersByTime(SHIPPER_FLUSH_INTERVAL_MS);
		expect(sent[2]).toEqual({ type: 'worker_log', stream: 'stdout', text: 'step started\n' });
	});

	it('keeps output printed while disconnected for the next connection', () => {
		const { shipper, out, sent, send } = setup();
		shipper.attach(send);
		shipper.detach();
		out.stream.write('[wait] daemon connection closed\n');
		vi.advanceTimersByTime(5000);
		expect(sent).toEqual([]);

		shipper.attach(send);
		expect(sent).toEqual([{ type: 'worker_log', stream: 'stdout', text: '[wait] daemon connection closed\n' }]);
	});

	it('keeps only the newest output while nothing can be sent, and says how much it threw away', () => {
		const { shipper, out, sent, send } = setup();
		out.stream.write('a'.repeat(SHIPPER_BACKLOG_MAX_CHARS));
		out.stream.write('newest\n');

		shipper.attach(send);

		// The oldest write went as a whole; what is said is how many characters were lost.
		expect(sent).toEqual([
			{ type: 'worker_log', stream: 'stdout', text: 'newest\n', dropped: SHIPPER_BACKLOG_MAX_CHARS },
		]);
	});

	it('keeps only the end of one huge write and counts the rest', () => {
		const { shipper, out, sent, send } = setup();
		out.stream.write(`${'h'.repeat(SHIPPER_BACKLOG_MAX_CHARS + 100)}END`);

		shipper.attach(send);

		expect(sent[0]?.dropped).toBe(103);
		expect(sent.map(message => message.text).join('')).toHaveLength(SHIPPER_BACKLOG_MAX_CHARS);
		expect(sent.at(-1)?.text.endsWith('END')).toBe(true);
	});

	it('splits a large write into chunks the daemon accepts, each far below the frame limit', () => {
		const { shipper, out, sent, send } = setup();
		out.stream.write('y'.repeat(50_000));
		shipper.attach(send);

		expect(sent.length).toBeGreaterThan(1);
		for (const message of sent) {
			expect(message.text.length).toBeLessThanOrEqual(16 * 1024);
			expect(Buffer.byteLength(serializeWorkerFrame(message))).toBeLessThan(MAX_WORKER_FRAME_BYTES);
		}
		expect(sent.map(message => message.text).join('')).toHaveLength(50_000);
	});

	it('holds output beyond the per-second cap for the next second instead of flooding the daemon', () => {
		const { shipper, out, sent, send } = setup();
		shipper.attach(send);
		const half = SHIPPER_MAX_CHARS_PER_SECOND / 2;
		out.stream.write('z'.repeat(half));
		vi.advanceTimersByTime(SHIPPER_FLUSH_INTERVAL_MS);
		out.stream.write(`${'w'.repeat(half)}late\n`);
		vi.advanceTimersByTime(SHIPPER_FLUSH_INTERVAL_MS);
		// Same second: only what the budget still allows has left.
		expect(sent.map(message => message.text).join('')).toHaveLength(SHIPPER_MAX_CHARS_PER_SECOND);
		expect(sent.at(-1)?.text.endsWith('late\n')).toBe(false);

		vi.advanceTimersByTime(1000);
		expect(sent.at(-1)?.text.endsWith('late\n')).toBe(true);
		expect(sent.map(message => message.text).join('')).toHaveLength(SHIPPER_MAX_CHARS_PER_SECOND + 5);
	});

	it('reports a failing send once through the callback, never through the streams it listens to, and counts the loss', () => {
		const onSendFailure = vi.fn();
		const { shipper, out, err } = setup({ onSendFailure });
		const failing = (): void => {
			throw new Error('frame too large');
		};
		shipper.attach(failing);
		out.stream.write('one\n');
		vi.advanceTimersByTime(SHIPPER_FLUSH_INTERVAL_MS);
		out.stream.write('two\n');
		vi.advanceTimersByTime(SHIPPER_FLUSH_INTERVAL_MS);

		expect(onSendFailure).toHaveBeenCalledTimes(1);
		expect(err.written).toEqual([]);
	});

	it('restores the original writes on uninstall and refuses a second install', () => {
		const { shipper, out, err, sent, send } = setup();
		const wrapped = out.stream.write;
		expect(() => shipper.install(out.stream as never, err.stream as never)).toThrow(/already installed/);
		shipper.uninstall();
		expect(out.stream.write).not.toBe(wrapped);
		out.stream.write('after\n');
		shipper.attach(send);
		expect(sent).toEqual([]);
	});

	it('accepts a Buffer chunk and ignores an empty one', () => {
		const { shipper, out, sent, send } = setup();
		out.stream.write(Buffer.from('bytes\n'));
		out.stream.write('');
		shipper.attach(send);
		expect(sent).toEqual([{ type: 'worker_log', stream: 'stdout', text: 'bytes\n' }]);
	});
});
