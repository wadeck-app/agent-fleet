import * as path from 'path';
import * as child_process from 'child_process';
import { createDaemonClient, readPortFile } from '@wadeck/singleton-daemon-kit';
import type { RunResult, QueueStatus, CancelResult } from './engine-daemon.js';
import type { CommandMap } from '@wadeck/singleton-daemon-kit';

type EngineCommands = {
  'run-flow':     (payload?: unknown) => Promise<RunResult>;
  'queue-status': (payload?: unknown) => Promise<QueueStatus>;
  'cancel':       (payload?: unknown) => Promise<CancelResult>;
} & CommandMap;

const ENGINE_COMMANDS_STUB = {
  'run-flow':     async (): Promise<RunResult>    => ({ runId: '', status: 'started' }),
  'queue-status': async (): Promise<QueueStatus>  => ({ pending: 0, running: 0 }),
  'cancel':       async (): Promise<CancelResult> => ({ ok: false }),
} satisfies EngineCommands;

export function createEngineClient(configDir: string) {
  return createDaemonClient<EngineCommands>({ configDir, commands: ENGINE_COMMANDS_STUB });
}

/**
 * Spawn the engine daemon as a detached background process (Windows-compatible).
 * Uses child_process.spawn (NOT fork) with { detached: true, stdio: 'ignore' }.
 */
export function spawnDaemon(configDir: string): child_process.ChildProcess {
  const child = child_process.spawn(
    process.execPath,
    [path.join(import.meta.dirname, 'engine-daemon-entry.js'), configDir],
    { detached: true, stdio: 'ignore' }
  );
  child.unref();
  return child;
}

const AUTO_START_TIMEOUT_MS = 5_000;
const AUTO_START_POLL_INTERVAL_MS = 100;

/**
 * Auto-start the engine daemon if not running, then return the client.
 * Polls for config.port every 100ms up to 5s before throwing.
 */
export async function autoStartDaemon(configDir: string): Promise<ReturnType<typeof createEngineClient>> {
  const client = createEngineClient(configDir);
  const running = await client.isRunning();
  if (running) return client;

  spawnDaemon(configDir);

  const deadline = Date.now() + AUTO_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, AUTO_START_POLL_INTERVAL_MS));
    const data = await readPortFile(configDir);
    if (data !== null) return client;
  }

  throw new Error(
    `Engine daemon failed to start within 5s — check logs (configDir: ${configDir})`
  );
}
