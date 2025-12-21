/**
 * Global Teardown for Playwright
 * Stops all backend servers started by global-setup
 */
import { exec } from 'child_process';
import { readFile, unlink } from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ServerInfo {
	port: number;
	pid: number;
}

const projectRoot = path.resolve(__dirname, '../../..');
const tempFolder = path.resolve(projectRoot, 'packages/e2e-web/temp');

async function globalTeardownWebServer() {
	console.log('\n🧹 === STOPPING BACKEND SERVERS ===\n');

	try {
		// Use RUN_ID from environment to read the correct servers file
		const runId = process.env.RUN_ID || 'default';
		const filename = path.resolve(tempFolder, `.test-servers-${runId}.json`);
		// const filename = `.test-servers-${runId}.json`;

		let data;
		try {
			data = await readFile(filename, 'utf-8');
		} catch (error) {
			console.log(`ℹ️  No backend servers file found for RUN_ID: ${runId}, nothing to stop.`);
			return;
		}

		const servers: ServerInfo[] = JSON.parse(data);

		console.log(`🛑 Stopping ${servers.length} backend servers (RUN_ID: ${runId})...`);

		// Kill all server processes
		for (const server of servers) {
			try {
				// On Windows, use taskkill; on Unix, use kill
				if (process.platform === 'win32') {
					// Use /F (force) because backend servers don't respond to graceful termination
					await execAsync(`taskkill /PID ${server.pid} /T /F`);
				} else {
					process.kill(server.pid, 'SIGKILL');
				}
				console.log(`✅ Stopped server on port ${server.port} (PID: ${server.pid})`);
			} catch (error) {
				// Process might already be dead, that's okay
				console.log(`⚠️  Server on port ${server.port} already stopped`);
			}
		}

		// Clean up all RUN_ID-specific files
		await unlink(filename);
		console.log(`🗑️  Cleaned up ${filename}`);

		// Clean up port files
		try {
			await unlink(path.resolve(tempFolder, `.webapp-port-${runId}.json`));
			console.log(`🗑️  Cleaned up .webapp-port-${runId}.json`);
		} catch {
			// File might not exist if webServer didn't start
		}

		try {
			await unlink(path.resolve(tempFolder, `.storybook-port-${runId}.json`));
			console.log(`🗑️  Cleaned up .storybook-port-${runId}.json`);
		} catch {
			// File might not exist if Storybook wasn't used
		}

		console.log('\n✅ All backend servers stopped successfully\n');
	} catch (error) {
		console.error('❌ Error during teardown:', error);
		// Don't throw - teardown should always complete
	}
}

export default globalTeardownWebServer;
