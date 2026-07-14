import { createDaemon } from '@wadeck/singleton-daemon-kit';
import type { CommandMap } from '@wadeck/singleton-daemon-kit';

export interface RunResult {
  runId: string;
  status: 'started' | 'queued';
  queuePosition?: number;
}
export interface QueueStatus { pending: number; running: number; }
export interface CancelResult { ok: boolean; reason?: string; }

// Simple in-memory queue for the PoC
class FlowEngine {
  private queue: Array<{ runId: string; flowRef: string; inputs?: unknown }> = [];
  private running: string[] = [];

  async run(payload: unknown): Promise<RunResult> {
    const { flowRef, inputs } = payload as { flowRef: string; inputs?: unknown };
    const runId = crypto.randomUUID();
    if (this.running.length > 0) {
      this.queue.push({ runId, flowRef, inputs });
      return { runId, status: 'queued', queuePosition: this.queue.length };
    }
    this.running.push(runId);
    // Fire-and-forget execution (simplified)
    setImmediate(() => {
      this.running = this.running.filter(id => id !== runId);
      const next = this.queue.shift();
      if (next) this.running.push(next.runId);
    });
    return { runId, status: 'started' };
  }

  queueStatus(): QueueStatus {
    return { pending: this.queue.length, running: this.running.length };
  }

  cancel(payload: unknown): CancelResult {
    const { runId } = payload as { runId: string };
    const idx = this.queue.findIndex(e => e.runId === runId);
    if (idx !== -1) { this.queue.splice(idx, 1); return { ok: true }; }
    if (this.running.includes(runId)) return { ok: false, reason: 'Cannot cancel running flow' };
    return { ok: false, reason: 'runId not found' };
  }
}

export async function startEngineDaemon(configDir: string) {
  const engine = new FlowEngine();
  const commands = {
    'run-flow':     async (payload: unknown): Promise<RunResult>    => engine.run(payload),
    'queue-status': async ():                Promise<QueueStatus>   => engine.queueStatus(),
    'cancel':       async (payload: unknown): Promise<CancelResult> => engine.cancel(payload),
  } satisfies CommandMap;

  return createDaemon({
    configDir,
    commands,
    port: 47832,
    idleTimeout: 300_000,  // 5 minutes
    drainTimeout: 30_000,
  });
}
