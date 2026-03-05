import type { Intervention, InterventionStatus, Task } from 'shared-orch-worker/domain-types';

export interface IOrchestratorStorage {
	// Tasks
	saveTask(task: Task): Promise<void>;
	loadTask(taskId: string): Promise<Task | null>;
	listTasks(): Promise<Task[]>;
	deleteTask(taskId: string): Promise<void>;
	taskExists(taskId: string): Promise<boolean>;
	clearAllTasks(): Promise<number>;

	// Interventions
	saveIntervention(intervention: Intervention): Promise<void>;
	loadIntervention(id: string): Promise<Intervention | null>;
	listInterventions(): Promise<Intervention[]>;
	deleteIntervention(id: string): Promise<void>;
	interventionExists(id: string): Promise<boolean>;
	findInterventionsByTaskId(taskId: string): Promise<Intervention[]>;
	findInterventionsByStatus(status: InterventionStatus): Promise<Intervention[]>;
}
