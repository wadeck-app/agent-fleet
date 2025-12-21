# Scenario 3: Embedded Mode (Orchestrator lance l'UI)

## Use Case

- Single command pour tout lancer
- UI intégrée à l'orchestrateur
- Expérience "desktop app" simplifiée
- Pas de gestion de multiples processes pour l'utilisateur

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Desktop Machine                           │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         Orchestrator Process                           │ │
│  │                                                        │ │
│  │  ┌──────────────────────────────────────────────────┐ │ │
│  │  │  Orchestrator Core                               │ │ │
│  │  │  ┌────────────────────────────────────────────┐  │ │ │
│  │  │  │  Lifecycle Manager                         │  │ │ │
│  │  │  │  - Spawns Web UI as child process          │  │ │ │
│  │  │  │  - Monitors UI health                      │  │ │ │
│  │  │  └────────────────┬───────────────────────────┘  │ │ │
│  │  │                   │ spawn()                      │ │ │
│  │  │  ┌────────────────▼───────────────────────────┐  │ │ │
│  │  │  │  WebSocket Client Manager                  │  │ │ │
│  │  │  │  - Auto-connects to child UI               │  │ │ │
│  │  │  └────────────────┬───────────────────────────┘  │ │ │
│  │  │                   │                              │ │ │
│  │  │  ┌────────────────▼───────────────────────────┐  │ │ │
│  │  │  │  WebSocket Server (/ws/workers)            │  │ │ │
│  │  │  └────────────────┬───────────────────────────┘  │ │ │
│  │  └───────────────────┼────────────────────────────────┘ │ │
│  └────────────────────┼─┼────────────────────────────────────┘ │
│                       │ ▲                                    │
│                       │ │ ws://localhost:RANDOM_PORT         │
│                       │ │                                    │
│  ┌────────────────────▼─┴──────────────────────────────────┐ │
│  │         Web UI Application (Child Process)             │ │
│  │  ┌──────────────────┐      ┌─────────────────────┐    │ │
│  │  │  HTTP Server     │      │  WebSocket Server   │    │ │
│  │  │  (Port: random)  │      │  (/ws/orchestrator) │    │ │
│  │  └──────────────────┘      └─────────────────────┘    │ │
│  │           │                                            │ │
│  └───────────┼────────────────────────────────────────────┘ │
│              │                                              │
│              │ http://localhost:RANDOM_PORT                 │
│              ▼                                              │
│         ┌──────────┐                                        │
│         │ Browser  │ (auto-opens)                           │
│         └──────────┘                                        │
│                                                             │
│                          ▲                                  │
│                          │ WS (server mode)                 │
│                 ┌────────┴─────────┐                        │
│                 │                  │                        │
│            ┌────┴────┐       ┌────┴────┐                   │
│            │ Worker  │       │ Worker  │                   │
│            │   #1    │       │   #2    │                   │
│            └─────────┘       └─────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

## Startup Flow

### 1. User starts orchestrator

```bash
npm run start
# or
agent-fleet start --ui
```

### 2. Orchestrator lifecycle sequence

```typescript
1. OrchestratorCore.start()
   ├─ Initialize worker server (port 8080)
   ├─ Find available random port for UI (ex: 37421)
   ├─ Spawn UI child process:
   │   └─ spawn('node', ['web-ui/dist/server.js', '--port', '37421'])
   ├─ Wait for UI ready signal (HTTP health check)
   ├─ Connect WebSocket client to ws://localhost:37421/ws/orchestrator
   ├─ Open browser: http://localhost:37421
   └─ Monitor UI process health

2. Graceful shutdown on SIGINT/SIGTERM:
   ├─ Disconnect workers
   ├─ Close UI WebSocket connection
   ├─ Kill UI child process
   └─ Exit
```

## Implementation Details

### Lifecycle Manager

```typescript
// src/orchestrator/lifecycle/UILifecycleManager.ts

export class UILifecycleManager {
	private uiProcess: ChildProcess | null = null;
	private uiPort: number | null = null;

	async startUI(): Promise<{ port: number; endpoint: string }> {
		// 1. Find available port
		this.uiPort = await findAvailablePort(30000, 40000);

		// 2. Spawn UI process
		this.uiProcess = spawn(
			'node',
			['web-ui/dist/server.js', '--port', this.uiPort.toString(), '--orchestrator-token', generateToken()],
			{
				stdio: ['ignore', 'pipe', 'pipe'],
				detached: false,
			}
		);

		// 3. Monitor stdout/stderr
		this.uiProcess.stdout.on('data', data => {
			logger.debug(`[UI] ${data}`);
		});

		// 4. Wait for ready signal
		await this.waitForUIReady(this.uiPort);

		// 5. Return connection info
		return {
			port: this.uiPort,
			endpoint: `ws://localhost:${this.uiPort}/ws/orchestrator`,
		};
	}

	private async waitForUIReady(port: number): Promise<void> {
		const maxAttempts = 30;
		for (let i = 0; i < maxAttempts; i++) {
			try {
				await fetch(`http://localhost:${port}/health`);
				return; // Success
			} catch {
				await sleep(1000);
			}
		}
		throw new Error('UI failed to start');
	}

	async stopUI(): Promise<void> {
		if (this.uiProcess) {
			this.uiProcess.kill('SIGTERM');
			// Wait for graceful shutdown
			await new Promise(resolve => {
				this.uiProcess.once('exit', resolve);
				setTimeout(() => {
					this.uiProcess.kill('SIGKILL'); // Force after 5s
					resolve(null);
				}, 5000);
			});
		}
	}

	monitorHealth(): void {
		if (this.uiProcess) {
			this.uiProcess.on('exit', code => {
				logger.error(`UI process exited with code ${code}`);
				// Decide: restart or shutdown orchestrator?
			});
		}
	}
}
```

### Browser Auto-Open

```typescript
import open from 'open';

async function openBrowser(url: string): Promise<void> {
	try {
		await open(url);
		logger.info(`Browser opened: ${url}`);
	} catch (error) {
		logger.warn(`Failed to auto-open browser: ${error.message}`);
		logger.info(`Please open manually: ${url}`);
	}
}
```

### Port Selection Strategy

```typescript
async function findAvailablePort(min: number, max: number): Promise<number> {
	for (let port = min; port <= max; port++) {
		if (await isPortAvailable(port)) {
			return port;
		}
	}
	throw new Error(`No available port in range ${min}-${max}`);
}

async function isPortAvailable(port: number): Promise<boolean> {
	return new Promise(resolve => {
		const server = net.createServer();
		server.once('error', () => resolve(false));
		server.once('listening', () => {
			server.close();
			resolve(true);
		});
		server.listen(port);
	});
}
```

## Configuration

```typescript
// config/embedded.config.ts
{
  mode: "embedded",
  ui: {
    enabled: true,
    autoStart: true,
    autoOpenBrowser: true,
    portRange: [30000, 40000],
    binaryPath: "web-ui/dist/server.js", // or bundled executable
    healthCheckTimeout: 30000,
    shutdownTimeout: 5000
  },
  uiClient: {
    // Auto-generated at runtime
    endpoint: null, // Set after UI spawned
    authToken: null, // Generated token
    autoConnect: true
  }
}
```

## Packaging Options

### Option A: Separate Node processes

```
agent-fleet/
├── dist/
│   ├── orchestrator/
│   │   └── index.js
│   └── web-ui/
│       └── server.js       ← Spawned as child
```

### Option B: Bundled executable (pkg, nexe)

```
agent-fleet.exe
├── orchestrator (main)
└── web-ui (embedded, extracted at runtime)
```

### Option C: Single server (Express)

```typescript
// All in one process
const app = express();
app.use('/api', orchestratorAPI);
app.use('/', staticFiles);
app.ws('/ws/orchestrator', uiWebSocket);
app.ws('/ws/workers', workerWebSocket);
```

## Process Management

### Graceful Shutdown

```typescript
process.on('SIGINT', async () => {
	logger.info('Shutting down...');

	// 1. Stop accepting new workers
	await workerServer.close();

	// 2. Disconnect UI client
	await uiClient.disconnect();

	// 3. Stop UI process
	await uiLifecycle.stopUI();

	// 4. Exit
	process.exit(0);
});
```

### Crash Recovery

```typescript
uiLifecycle.on('ui-crashed', async exitCode => {
	logger.error(`UI crashed with code ${exitCode}`);

	if (config.ui.autoRestart) {
		logger.info('Restarting UI...');
		await uiLifecycle.startUI();
		await uiClient.reconnect();
	} else {
		logger.info('Auto-restart disabled, continuing without UI');
	}
});
```

## CLI Commands

```bash
# Start with embedded UI (default)
agent-fleet start

# Start without UI
agent-fleet start --no-ui

# Start and specify UI port
agent-fleet start --ui-port 3000

# Start in headless mode (no browser open)
agent-fleet start --headless

# Check status
agent-fleet status
# Output:
# Orchestrator: Running (PID 1234)
# Web UI: Running on http://localhost:37421
# Workers: 2 connected
```

## Pros/Cons

**Pros**:

- Simple UX: one command to start
- Pas de gestion manuelle des processes
- Port conflicts résolus automatiquement
- Intégration tight (shared config, logs)
- Desktop app experience

**Cons**:

- Plus complexe à développer (lifecycle management)
- Debugging plus difficile (2 processes)
- Crash UI peut nécessiter restart orchestrator
- Bundling/packaging plus lourd
- Hot reload UI nécessite restart complet

## Testing Strategy

```typescript
describe('UILifecycleManager', () => {
	it('should spawn UI and connect', async () => {
		const lifecycle = new UILifecycleManager(config);
		const { port, endpoint } = await lifecycle.startUI();

		expect(port).toBeGreaterThan(30000);
		expect(endpoint).toBe(`ws://localhost:${port}/ws/orchestrator`);

		// Health check
		const response = await fetch(`http://localhost:${port}/health`);
		expect(response.ok).toBe(true);

		await lifecycle.stopUI();
	});

	it('should handle UI crash gracefully', async () => {
		const lifecycle = new UILifecycleManager(config);
		await lifecycle.startUI();

		// Simulate crash
		lifecycle.uiProcess.kill('SIGKILL');

		// Wait for event
		const exitCode = await new Promise(resolve => {
			lifecycle.once('ui-crashed', resolve);
		});

		expect(exitCode).not.toBe(0);
	});
});
```
