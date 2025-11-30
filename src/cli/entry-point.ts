// Simple CLI to add tasks to the orchestrator

import { Task } from '../shared/types.js';

const REST_API_URL = 'http://localhost:3737';

interface CreateTaskRequest {
  description: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  metadata?: Record<string, any>;
}

async function createTask(request: CreateTaskRequest): Promise<void> {
  try {
    const response = await fetch(`${REST_API_URL}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string };
      throw new Error(error.error || 'Failed to create task');
    }

    const task = await response.json() as Task;
    console.log('✅ Task created successfully:');
    console.log(`   ID: ${task.id}`);
    console.log(`   Description: ${task.description}`);
    console.log(`   Status: ${task.status}`);
    console.log(`   Priority: ${task.priority}`);
  } catch (error) {
    console.error('❌ Error creating task:', (error as Error).message);
    process.exit(1);
  }
}

async function listTasks(): Promise<void> {
  try {
    const response = await fetch(`${REST_API_URL}/tasks`);

    if (!response.ok) {
      throw new Error('Failed to fetch tasks');
    }

    const tasks = await response.json() as Task[];

    if (tasks.length === 0) {
      console.log('No tasks found.');
      return;
    }

    console.log(`\n📋 Tasks (${tasks.length} total):\n`);
    tasks.forEach((task) => {
      console.log(`  [${task.status}] ${task.id.substring(0, 8)}... - ${task.description.substring(0, 60)}${task.description.length > 60 ? '...' : ''}`);
    });
    console.log();
  } catch (error) {
    console.error('❌ Error listing tasks:', (error as Error).message);
    process.exit(1);
  }
}

async function showStats(): Promise<void> {
  try {
    const response = await fetch(`${REST_API_URL}/stats`);

    if (!response.ok) {
      throw new Error('Failed to fetch stats');
    }

    const stats = await response.json() as {
      restPort: number;
      wsPort: number;
      workers: number;
      workersList: Array<{ id: string; type: string; taskId: string | null }>;
      tasks: { total: number; byStatus: Record<string, number> };
    };

    console.log('\n📊 Orchestrator Statistics:\n');
    console.log(`  REST Port: ${stats.restPort}`);
    console.log(`  WebSocket Port: ${stats.wsPort}`);
    console.log(`  Workers: ${stats.workers}`);
    console.log(`  Total Tasks: ${stats.tasks.total}`);
    console.log('\n  Tasks by status:');
    Object.entries(stats.tasks.byStatus).forEach(([status, count]) => {
      console.log(`    ${status}: ${count}`);
    });
    console.log();

    if (stats.workersList.length > 0) {
      console.log('  Connected workers:');
      stats.workersList.forEach((worker) => {
        console.log(`    ${worker.id} (${worker.type}) - ${worker.taskId ? `working on ${worker.taskId}` : 'idle'}`);
      });
      console.log();
    }
  } catch (error) {
    console.error('❌ Error fetching stats:', (error as Error).message);
    process.exit(1);
  }
}

// @formatter:off
async function resolvePartialTaskId(partialId: string): Promise<string> {
  try {
    const response = await fetch(`${REST_API_URL}/tasks`);

    if (!response.ok) {
      throw new Error('Failed to fetch tasks');
    }

    const tasks = await response.json() as Task[];
    const matches = tasks.filter(task => task.id.startsWith(partialId));

    if (matches.length === 0) {
      throw new Error(`No task found with ID starting with "${partialId}"`);
    }

    if (matches.length > 1) {
      console.error(`❌ Ambiguous task ID "${partialId}". Multiple matches found:`);
      matches.forEach(task => {
        console.error(`   ${task.id} - ${task.description.substring(0, 60)}${task.description.length > 60 ? '...' : ''}`);
      });
      throw new Error('Please provide a more specific task ID');
    }

    return matches[0].id;
  } catch (error) {
    throw error;
  }
}
// @formatter:on

async function deleteTask(taskId: string): Promise<void> {
  try {
    // Resolve partial ID to full ID
    const fullTaskId = await resolvePartialTaskId(taskId);

    const response = await fetch(`${REST_API_URL}/tasks/${fullTaskId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string };
      throw new Error(error.error || 'Failed to delete task');
    }

    console.log(`✅ Task ${fullTaskId.substring(0, 8)}... deleted successfully`);
  } catch (error) {
    console.error('❌ Error deleting task:', (error as Error).message);
    process.exit(1);
  }
}

async function clearAllTasks(): Promise<void> {
  try {
    const response = await fetch(`${REST_API_URL}/tasks`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error('Failed to clear tasks');
    }

    const result = await response.json() as { message: string };
    console.log(`✅ ${result.message}`);
  } catch (error) {
    console.error('❌ Error clearing tasks:', (error as Error).message);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  console.log('Usage:');
  console.log('  npm run add-task create <description> [priority]');
  console.log('  npm run add-task list');
  console.log('  npm run add-task stats');
  console.log('  npm run add-task delete <taskId>');
  console.log('  npm run add-task clear');
  console.log('\nNote: Task IDs support partial matching (like git commit hashes).');
  console.log('      You can use just the first few characters if unique.');
  console.log('\nExamples:');
  console.log('  npm run add-task create "Add authentication system" high');
  console.log('  npm run add-task list');
  console.log('  npm run add-task stats');
  console.log('  npm run add-task delete abc123    # partial ID');
  console.log('  npm run add-task delete abc123-456-789...  # full ID also works');
  console.log('  npm run add-task clear');
  process.exit(0);
}

switch (command) {
  case 'create':
    if (!args[1]) {
      console.error('❌ Error: Description is required');
      console.log('Usage: npm run add-task create <description> [priority]');
      process.exit(1);
    }
    await createTask({
      description: args[1],
      priority: (args[2] as any) || 'medium'
    });
    break;

  case 'list':
    await listTasks();
    break;

  case 'stats':
    await showStats();
    break;

  case 'delete':
    if (!args[1]) {
      console.error('❌ Error: Task ID is required');
      console.log('Usage: npm run add-task delete <taskId>');
      console.log('Note: You can use a partial ID (e.g., first 6-8 characters)');
      process.exit(1);
    }
    await deleteTask(args[1]);
    break;

  case 'clear':
    await clearAllTasks();
    break;

  default:
    console.error(`❌ Unknown command: ${command}`);
    console.log('Available commands: create, list, stats, delete, clear');
    process.exit(1);
}
