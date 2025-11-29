/**
 * Simple test script to create a task and verify the system works
 */

const REST_API_URL = 'http://localhost:3737';

async function createTestTask(): Promise<void> {
  console.log('🧪 Creating test task...\n');

  try {
    const response = await fetch(`${REST_API_URL}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        description: 'Create a simple hello world function that returns "Hello, World!"',
        priority: 'medium',
        metadata: {
          test: true
        }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create task');
    }

    const task = await response.json();
    console.log('✅ Test task created successfully!');
    console.log(`   ID: ${task.id}`);
    console.log(`   Description: ${task.description}`);
    console.log(`   Status: ${task.status}`);
    console.log(`   Priority: ${task.priority}\n`);

    return task.id;
  } catch (error) {
    console.error('❌ Error:', (error as Error).message);
    process.exit(1);
  }
}

async function checkStats(): Promise<void> {
  console.log('📊 Checking system stats...\n');

  try {
    const response = await fetch(`${REST_API_URL}/stats`);

    if (!response.ok) {
      throw new Error('Failed to fetch stats');
    }

    const stats = await response.json();

    console.log(`REST API Port: ${stats.restPort}`);
    console.log(`WebSocket Port: ${stats.wsPort}`);
    console.log(`Connected Workers: ${stats.workers}`);
    console.log(`Total Tasks: ${stats.tasks.total}\n`);

    if (stats.tasks.byStatus) {
      console.log('Tasks by status:');
      Object.entries(stats.tasks.byStatus).forEach(([status, count]) => {
        console.log(`  ${status}: ${count}`);
      });
      console.log();
    }

    if (stats.workersList && stats.workersList.length > 0) {
      console.log('Connected workers:');
      stats.workersList.forEach((worker: any) => {
        console.log(`  - ${worker.type} (${worker.id.substring(0, 8)}...)`);
        if (worker.taskId) {
          console.log(`    Currently working on: ${worker.taskId}`);
        }
      });
      console.log();
    }
  } catch (error) {
    console.error('❌ Error:', (error as Error).message);
    process.exit(1);
  }
}

// Run test
console.log('╔════════════════════════════════════════╗');
console.log('║  Agent Fleet - Simple Test            ║');
console.log('╚════════════════════════════════════════╝\n');

await checkStats();
await createTestTask();

console.log('✅ Test completed! Check the orchestrator logs to see the task being processed.\n');
