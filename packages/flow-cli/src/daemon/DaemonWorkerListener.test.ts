import type { FlowConfig } from '../config/FlowConfig';
import { DaemonWorkerListener } from './DaemonWorkerListener.js';
import { WebSocketServerClosedError } from './WebSocketServer';

const { writeDaemonLog, publishWorkerPort, start } = vi.hoisted(() => ({
	writeDaemonLog: vi.fn(),
	publishWorkerPort: vi.fn(),
	start: vi.fn(),
}));
vi.mock('./DaemonLog.js', () => ({ writeDaemonLog }));
vi.mock('./publishWorkerPort.js', () => ({ publishWorkerPort }));
vi.mock('./WebSocketServer', async importOriginal => ({
	...(await importOriginal<typeof import('./WebSocketServer')>()),
	WebSocketServer: class {
		start = start;
	},
}));

const worker = { bindAddress: '127.0.0.1', tls: undefined } as unknown as FlowConfig['worker'];
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

function build() {
	const onBound = vi.fn();
	const listener = new DaemonWorkerListener(5000, 'logs', 'dir', worker, {
		onMessage: vi.fn(),
		onClose: vi.fn(),
		onBound,
	});
	return { listener, onBound };
}

describe('DaemonWorkerListener', () => {
	beforeEach(() => {
		writeDaemonLog.mockClear();
		publishWorkerPort.mockClear();
		start.mockReset();
	});

	it('has no bound port before the bind, then records and publishes it', async () => {
		start.mockResolvedValue(5000);
		const { listener, onBound } = build();
		expect(listener.boundPort).toBeUndefined();
		listener.start();
		await settle();
		expect(listener.boundPort).toBe(5000);
		expect(publishWorkerPort).toHaveBeenCalledWith('dir', 5000);
		expect(onBound).toHaveBeenCalledTimes(1);
		expect(writeDaemonLog).not.toHaveBeenCalled();
	});

	it('says so when the port moved away from the requested one', async () => {
		start.mockResolvedValue(5003);
		const { listener } = build();
		listener.start();
		await settle();
		expect(listener.boundPort).toBe(5003);
		expect(writeDaemonLog).toHaveBeenCalledWith(
			'logs',
			'info',
			expect.stringContaining('Worker listener bound on port 5003 instead of 5000')
		);
	});

	it('logs, publishes nothing and does not call onBound when stopped while scanning', async () => {
		start.mockRejectedValue(new WebSocketServerClosedError());
		const { listener, onBound } = build();
		listener.start();
		await settle();
		expect(writeDaemonLog).toHaveBeenCalledWith(
			'logs',
			'info',
			'Worker listener not bound: the daemon stopped first'
		);
		expect(publishWorkerPort).not.toHaveBeenCalled();
		expect(onBound).not.toHaveBeenCalled();
	});

	it('reports another start failure on stderr', async () => {
		const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
		start.mockRejectedValue(new Error('EACCES'));
		build().listener.start();
		await settle();
		expect(stderr).toHaveBeenCalledWith(expect.stringContaining('WebSocket server failed to start'));
		stderr.mockRestore();
	});
});
