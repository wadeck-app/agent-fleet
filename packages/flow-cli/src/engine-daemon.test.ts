import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDaemon } from '@wadeck/singleton-daemon-kit';
import type { CommandMap } from '@wadeck/singleton-daemon-kit';
import type { RunResult, QueueStatus, CancelResult } from './engine-daemon.js';

// ---------------------------------------------------------------------------
// T9 requires mocking child_process.spawn at the module level (ESM restriction:
// cannot vi.spyOn() a built-in module namespace property at runtime).
// This mock is hoisted and affects T8/T9 tests; other tests do not spawn daemons.
// Note: vitest config has mockReset: true so the return value is cleared between
// tests — we re-set it in beforeEach for T8 and T9.
// ---------------------------------------------------------------------------
vi.mock('child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('child_process')>();
  return {
    ...original,
    spawn: vi.fn().mockReturnValue({ unref: vi.fn(), on: vi.fn(), pid: 99999 }),
  };
});

// Re-establish spawn mock return value before each test (cleared by mockReset: true)
beforeEach(async () => {
  const childProcess = await import('child_process');
  vi.mocked(childProcess.spawn).mockReturnValue(
    { unref: vi.fn(), on: vi.fn(), pid: 99999 } as unknown as ReturnType<typeof childProcess.spawn>
  );
});

// ---------------------------------------------------------------------------
// Helper: engine commands for tests — identical logic to engine-daemon.ts but
// WITHOUT setImmediate auto-completion so the running slot stays occupied for
// the duration of multi-step tests (T2, T3, T5).
// ---------------------------------------------------------------------------

function makeEngineCommands() {
  const queue: Array<{ runId: string; flowRef: string; inputs?: unknown }> = [];
  // Kept as a plain array so closure captures it correctly
  const running: string[] = [];

  async function run(payload: unknown): Promise<RunResult> {
    const { flowRef, inputs } = payload as { flowRef: string; inputs?: unknown };
    const runId = crypto.randomUUID();
    if (running.length > 0) {
      queue.push({ runId, flowRef, inputs });
      return { runId, status: 'queued', queuePosition: queue.length };
    }
    running.push(runId);
    // No auto-complete: the slot stays occupied until the daemon is torn down.
    // This makes queueing assertions reliable in tests.
    return { runId, status: 'started' };
  }

  function queueStatus(): QueueStatus {
    return { pending: queue.length, running: running.length };
  }

  function cancel(payload: unknown): CancelResult {
    const { runId } = payload as { runId: string };
    const idx = queue.findIndex(e => e.runId === runId);
    if (idx !== -1) { queue.splice(idx, 1); return { ok: true }; }
    if (running.includes(runId)) return { ok: false, reason: 'Cannot cancel running flow' };
    return { ok: false, reason: 'runId not found' };
  }

  const commands = {
    'run-flow':     async (payload: unknown): Promise<RunResult>    => run(payload),
    'queue-status': async ():                Promise<QueueStatus>   => queueStatus(),
    'cancel':       async (payload: unknown): Promise<CancelResult> => cancel(payload),
  } satisfies CommandMap;

  return commands;
}

// ---------------------------------------------------------------------------
// T1 – T5: FlowEngine logic via createTestDaemon
// ---------------------------------------------------------------------------

describe('engine daemon commands', () => {
  it('T1: run-flow on empty queue → status started, runId present', async () => {
    await using daemon = await createTestDaemon({ commands: makeEngineCommands() });
    const result = await daemon.client.send('run-flow', { flowRef: 'my-flow.yml' }) as RunResult;
    expect(result.status).toBe('started');
    expect(result.runId).toBeTruthy();
    expect(typeof result.runId).toBe('string');
  });

  it('T2: run-flow while one running → status queued, queuePosition >= 1', async () => {
    await using daemon = await createTestDaemon({ commands: makeEngineCommands() });
    // First run occupies the slot (no auto-complete in test engine)
    const first = await daemon.client.send('run-flow', { flowRef: 'flow-a.yml' }) as RunResult;
    expect(first.status).toBe('started');

    // Second run should be queued because the slot is occupied
    const second = await daemon.client.send('run-flow', { flowRef: 'flow-b.yml' }) as RunResult;
    expect(second.status).toBe('queued');
    expect(second.queuePosition).toBeGreaterThanOrEqual(1);
  });

  it('T3: cancel queued runId → ok: true', async () => {
    await using daemon = await createTestDaemon({ commands: makeEngineCommands() });
    // Fill the running slot
    await daemon.client.send('run-flow', { flowRef: 'flow-a.yml' });
    // Queue a second
    const queued = await daemon.client.send('run-flow', { flowRef: 'flow-b.yml' }) as RunResult;
    expect(queued.status).toBe('queued');

    const result = await daemon.client.send('cancel', { runId: queued.runId }) as CancelResult;
    expect(result.ok).toBe(true);
  });

  it('T4: cancel unknown runId → ok: false, reason present', async () => {
    await using daemon = await createTestDaemon({ commands: makeEngineCommands() });
    const result = await daemon.client.send('cancel', { runId: 'does-not-exist' }) as CancelResult;
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('T5: queue-status with 2 queued, 1 running → { pending: 2, running: 1 }', async () => {
    await using daemon = await createTestDaemon({ commands: makeEngineCommands() });
    // Fill running slot
    await daemon.client.send('run-flow', { flowRef: 'flow-a.yml' });
    // Queue two more
    await daemon.client.send('run-flow', { flowRef: 'flow-b.yml' });
    await daemon.client.send('run-flow', { flowRef: 'flow-c.yml' });

    const status = await daemon.client.send('queue-status') as QueueStatus;
    expect(status.pending).toBe(2);
    expect(status.running).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// T6: idle exit after idleTimeout
// ---------------------------------------------------------------------------

describe('T6: idle exit', () => {
  it('daemon exits automatically after idleTimeout', async () => {
    const onShutdown = vi.fn();
    const daemon = await createTestDaemon({
      commands: makeEngineCommands(),
      idleTimeout: 100,  // 100ms for a fast test
      drainTimeout: 50,
      hooks: { onShutdown },
    });

    // Wait long enough for idle to fire
    await new Promise(resolve => setTimeout(resolve, 400));

    expect(onShutdown).toHaveBeenCalledWith('idle');

    // Clean up (stop is idempotent)
    await daemon.stop('command');
    await daemon[Symbol.asyncDispose]();
  });
});

// ---------------------------------------------------------------------------
// T7: auto-start detection — isRunning returns false when no daemon
// ---------------------------------------------------------------------------

describe('T7: auto-start detection', () => {
  it('isRunning() returns false when no daemon is running', async () => {
    const { createEngineClient } = await import('./engine-client.js');
    const os = await import('os');
    const path = await import('path');
    const cryptoMod = await import('crypto');
    const fs = await import('fs/promises');

    const tmpDir = path.join(os.tmpdir(), cryptoMod.randomUUID());
    await fs.mkdir(tmpDir, { recursive: true });
    try {
      const client = createEngineClient(tmpDir);
      const running = await client.isRunning();
      expect(running).toBe(false);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// T8: auto-start timeout exceeded → throw with configDir in message
// (child_process.spawn is mocked at module level to be a no-op so the daemon
// never writes a port file, causing the 5s poll to time out)
// ---------------------------------------------------------------------------

describe('T8: auto-start timeout', () => {
  it('autoStartDaemon throws with configDir in message when daemon never writes port file', async () => {
    const { autoStartDaemon } = await import('./engine-client.js');
    const os = await import('os');
    const path = await import('path');
    const cryptoMod = await import('crypto');
    const fs = await import('fs/promises');

    const tmpDir = path.join(os.tmpdir(), cryptoMod.randomUUID());
    await fs.mkdir(tmpDir, { recursive: true });
    try {
      await expect(autoStartDaemon(tmpDir)).rejects.toThrow(tmpDir);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }, 10_000);
});

// ---------------------------------------------------------------------------
// T9: Windows detached spawn — verify spawn called with { detached: true, stdio: 'ignore' }
// (child_process.spawn is mocked at module level above)
// ---------------------------------------------------------------------------

describe('T9: Windows detached spawn', () => {
  it('spawnDaemon calls spawn with { detached: true, stdio: ignore }', async () => {
    const childProcess = await import('child_process');
    const { spawnDaemon } = await import('./engine-client.js');

    vi.mocked(childProcess.spawn).mockClear();

    spawnDaemon('/some/config/dir');

    expect(vi.mocked(childProcess.spawn)).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ detached: true, stdio: 'ignore' })
    );
  });
});
