import { Orchestrator } from 'orchestrator/core/Orchestrator';
import { logger } from 'shared-common/logger';

/**
 * Main entry point for the orchestrator
 */
export async function main() {
	const orchestrator = new Orchestrator();

	// Handle termination signals with proper async/await
	const handleShutdown = async (signal: string) => {
		logger.info(`[Orchestrator] Received ${signal}, shutting down gracefully...`);
		try {
			await orchestrator.shutdown();
			process.exit(0);
		} catch (error) {
			logger.error('[Orchestrator] Error during shutdown:', error);
			process.exit(1);
		}
	};

	process.on('SIGINT', () => void handleShutdown('SIGINT'));
	process.on('SIGTERM', () => void handleShutdown('SIGTERM'));

	// Start the orchestrator
	try {
		await orchestrator.start();
	} catch (error) {
		logger.error('[Orchestrator] Failed to start:', error);
		process.exit(1);
	}
}

// Start if this is the main module
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
	main();
}
