import { Storage } from '../shared/storage.js';
import { Task, TaskStatus, WorkerType, TaskHistoryEntry } from '../shared/types.js';
import { v4 as uuidv4 } from 'uuid';

export class TaskManager {
  private tasks: Map<string, Task>;

  constructor() {
    this.tasks = new Map();
    this.loadTasks();
  }

  /**
   * Charger toutes les tâches depuis le stockage
   */
  private loadTasks(): void {
    const tasks = Storage.listTasks();
    tasks.forEach(task => {
      this.tasks.set(task.id, task);
    });
    console.log(`[TaskManager] Loaded ${this.tasks.size} tasks`);
  }

  /**
   * Créer une nouvelle tâche
   */
  createTask(
    description: string,
    metadata: Partial<Task['metadata']> = {}
  ): Task {
    const task: Task = {
      id: uuidv4(),
      description,
      status: TaskStatus.BACKLOG,
      priority: (metadata.priority as Task['priority']) || 'medium',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedTo: null,
      comments: [],
      metadata: {
        ...metadata
      },
      history: [{
        timestamp: new Date().toISOString(),
        event: 'created',
        status: TaskStatus.BACKLOG
      }]
    };

    this.tasks.set(task.id, task);
    Storage.saveTask(task);
    console.log(`[TaskManager] Created task ${task.id}: ${description.substring(0, 50)}...`);
    return task;
  }

  /**
   * Mettre à jour le statut d'une tâche
   */
  updateTaskStatus(
    taskId: string,
    newStatus: TaskStatus,
    details: Partial<TaskHistoryEntry> = {}
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const oldStatus = task.status;
    task.status = newStatus;
    task.updatedAt = new Date().toISOString();

    // Ajouter à l'historique
    task.history.push({
      timestamp: task.updatedAt,
      event: 'status_change',
      oldStatus,
      newStatus,
      ...details
    });

    Storage.saveTask(task);
    console.log(`[TaskManager] Task ${taskId} status: ${oldStatus} → ${newStatus}`);
  }

  /**
   * Assigner une tâche à un worker
   */
  assignTask(taskId: string, workerId: string, workerType: WorkerType): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.assignedTo = { workerId, workerType };
    task.updatedAt = new Date().toISOString();

    task.history.push({
      timestamp: task.updatedAt,
      event: 'assigned',
      workerId,
      workerType
    });

    Storage.saveTask(task);
    console.log(`[TaskManager] Task ${taskId} assigned to ${workerType} worker ${workerId}`);
  }

  /**
   * Libérer une tâche (retirer l'assignation)
   */
  unassignTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.assignedTo = null;
    task.updatedAt = new Date().toISOString();

    task.history.push({
      timestamp: task.updatedAt,
      event: 'unassigned'
    });

    Storage.saveTask(task);
    console.log(`[TaskManager] Task ${taskId} unassigned`);
  }

  /**
   * Ajouter un commentaire à une tâche
   */
  addComment(taskId: string, author: string, content: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.comments.push({
      timestamp: new Date().toISOString(),
      author,
      content
    });

    task.updatedAt = new Date().toISOString();
    Storage.saveTask(task);
  }

  /**
   * Obtenir la prochaine tâche pour un type de worker
   */
  getNextTaskForWorker(workerType: WorkerType): Task | null {
    // Déterminer quel statut chercher selon le type de worker
    const statusMap: Record<WorkerType, TaskStatus[]> = {
      [WorkerType.PM]: [TaskStatus.BACKLOG],
      [WorkerType.PO]: [TaskStatus.REFINED],
      [WorkerType.DEV]: [TaskStatus.TODO, TaskStatus.CHANGES_REQUESTED],
      [WorkerType.REVIEWER]: [TaskStatus.REVIEW]
    };

    const targetStatuses = statusMap[workerType] || [];

    // Trouver la première tâche non assignée avec le bon statut
    // Prioriser par priority: urgent > high > medium > low
    const priorityOrder: Task['priority'][] = ['urgent', 'high', 'medium', 'low'];

    for (const priority of priorityOrder) {
      for (const task of this.tasks.values()) {
        if (
          targetStatuses.includes(task.status) &&
          !task.assignedTo &&
          task.priority === priority
        ) {
          return task;
        }
      }
    }

    return null;
  }

  /**
   * Obtenir toutes les tâches avec un statut donné
   */
  getTasksByStatus(status: TaskStatus): Task[] {
    return Array.from(this.tasks.values())
      .filter(task => task.status === status);
  }

  /**
   * Obtenir une tâche par ID
   */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Obtenir toutes les tâches
   */
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Obtenir des statistiques
   */
  getStats() {
    const byStatus: Record<string, number> = {};
    for (const task of this.tasks.values()) {
      byStatus[task.status] = (byStatus[task.status] || 0) + 1;
    }

    return {
      total: this.tasks.size,
      byStatus
    };
  }
}
