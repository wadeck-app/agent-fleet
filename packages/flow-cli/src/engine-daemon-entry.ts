import { startEngineDaemon } from './engine-daemon.js';

const configDir = process.argv[2];
if (!configDir) {
	console.error('engine-daemon-entry: configDir argument is required');
	process.exit(1);
}

startEngineDaemon(configDir).catch((err: unknown) => {
	console.error('Engine daemon failed to start:', err instanceof Error ? err.message : String(err));
	process.exit(1);
});
