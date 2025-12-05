// Minimal test - just UI, nothing else
import { TaskManager } from './src/orchestrator/core/TaskManager.js';
import { renderUI } from './src/orchestrator/ui.js';

console.log('Starting minimal orchestrator UI test...');

async function main() {
  const taskManager = new TaskManager();

  console.log('Creating UI...');
  const ui = await renderUI(taskManager, null as any);

  console.log('Starting UI...');
  ui.start();

  console.log('UI started. Press Q to quit.');
}

main().catch(error => {
  console.error('Failed:', error);
  process.exit(1);
});

// Handle SIGINT
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, exiting...');
  process.exit(0);
});
