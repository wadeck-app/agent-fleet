import type { WorkerTypeInstance } from 'extension-points';

/**
 * The one rule behind "requirement-only": a built worker-type instance that declares a non-empty `guarantees` list (or the
 * deprecated `exclusive: true`) never receives a step that requires nothing, never gets a worker asked of it for such demand,
 * and its workers do not count against `queue.concurrency`.
 */
export function isRequirementOnlyInstance(instance: Pick<WorkerTypeInstance, 'exclusive' | 'guarantees'>): boolean {
	return (instance.guarantees?.length ?? 0) > 0 || instance.exclusive === true;
}
