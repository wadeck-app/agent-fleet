import type { Intervention, InterventionStatus, Task } from 'shared-orch-worker/domain-types';

import type { IOrchestratorStorage } from './IOrchestratorStorage';

export class InMemoryOrchestratorStorage implements IOrchestratorStorage {
	private tasks: Map<string, Task> = new Map();
	private interventions: Map<string, Intervention> = new Map();

	clear(): void {
		this.tasks.clear();
		this.interventions.clear();
	}

	async saveTask(task: Task): Promise<void> {
		this.tasks.set(task.id, { ...task });
	}

	async loadTask(taskId: string): Promise<Task | null> {
		const task = this.tasks.get(taskId);
		return task ? { ...task } : null;
	}

	async listTasks(): Promise<Task[]> {
		return Array.from(this.tasks.values());
	}

	async deleteTask(taskId: string): Promise<void> {
		this.tasks.delete(taskId);
	}

	async taskExists(taskId: string): Promise<boolean> {
		return this.tasks.has(taskId);
	}

	async clearAllTasks(): Promise<number> {
		const count = this.tasks.size;
		this.tasks.clear();
		return count;
	}

	async saveIntervention(intervention: Intervention): Promise<void> {
		this.interventions.set(intervention.id, { ...intervention });
	}

	async loadIntervention(id: string): Promise<Intervention | null> {
		return this.interventions.get(id) ?? null;
	}

	async listInterventions(): Promise<Intervention[]> {
		return Array.from(this.interventions.values());
	}

	async deleteIntervention(id: string): Promise<void> {
		this.interventions.delete(id);
	}

	async interventionExists(id: string): Promise<boolean> {
		return this.interventions.has(id);
	}

	async findInterventionsByTaskId(taskId: string): Promise<Intervention[]> {
		return Array.from(this.interventions.values()).filter(i => i.taskId === taskId);
	}

	async findInterventionsByStatus(status: InterventionStatus): Promise<Intervention[]> {
		return Array.from(this.interventions.values()).filter(i => i.status === status);
	}
}
