/
  Health Checks for EE Tests
  Utilities to verify services are available before tests
 /

export interface HealthCheckResult {
	success: boolean;
	url: string;
	error?: string;
	responseTime?: number;
}

/
  Check if a URL is accessible
  @param url - The URL to check
  @param maxRetries - Maximum number of attempts (default: )
  @param retryDelay - Delay between attempts in ms (default: )
 /
export async function waitForService(
	url: string,
	maxRetries: number = ,
	retryDelay: number = 
): Promise<HealthCheckResult> {
	for (let attempt = ; attempt <= maxRetries; attempt++) {
		try {
			const startTime = Date.now();
			const response = await fetch(url);
			const responseTime = Date.now() - startTime;

			if (response.ok) {
				console.log(` Service ready at ${url} (attempt ${attempt}/${maxRetries}, ${responseTime}ms)`);
				return {
					success: true,
					url,
					responseTime,
				};
			}

			console.log(`  Service returned ${response.status} at ${url} (attempt ${attempt}/${maxRetries})`);
		} catch (error) {
			console.log(` Waiting for service at ${url} (attempt ${attempt}/${maxRetries})`);
		}

		// Don't wait after last attempt
		if (attempt < maxRetries) {
			await new Promise(resolve => setTimeout(resolve, retryDelay));
		}
	}

	const errorMessage = `Failed to connect to ${url} after ${maxRetries} attempts`;
	console.error(` ${errorMessage}`);
	return {
		success: false,
		url,
		error: errorMessage,
	};
}

/
  Check if Storybook is accessible
  @param port - Storybook server port (default: )
 /
export async function waitForStorybook(port: number = ): Promise<HealthCheckResult> {
	const url = `http://localhost:${port}`;
	console.log(` Checking Storybook health at ${url}...`);
	return waitForService(url);
}

/
  Check if frontend is accessible
  @param port - Frontend server port (default: )
 /
export async function waitForFrontend(port: number = ): Promise<HealthCheckResult> {
	const url = `http://localhost:${port}`;
	console.log(` Checking Frontend health at ${url}...`);
	return waitForService(url);
}

/
  Check if backend is accessible
  @param port - Backend server port (default: )
 /
export async function waitForBackend(port: number = ): Promise<HealthCheckResult> {
	const url = `http://localhost:${port}/health`;
	console.log(` Checking Backend health at ${url}...`);
	return waitForService(url);
}

/
  Check all services in parallel
  Fails if at least one service is not accessible
 /
export async function waitForAllServices(services: {
	storybook?: number;
	frontend?: number;
	backend?: number;
}): Promise<{ success: boolean; results: Record<string, HealthCheckResult> }> {
	const checks: Promise<[string, HealthCheckResult]>[] = [];

	if (services.storybook !== undefined) {
		checks.push(
			waitForStorybook(services.storybook).then(result => ['storybook', result] as [string, HealthCheckResult])
		);
	}

	if (services.frontend !== undefined) {
		checks.push(
			waitForFrontend(services.frontend).then(result => ['frontend', result] as [string, HealthCheckResult])
		);
	}

	if (services.backend !== undefined) {
		checks.push(
			waitForBackend(services.backend).then(result => ['backend', result] as [string, HealthCheckResult])
		);
	}

	const results = await Promise.all(checks);
	const resultMap = Object.fromEntries(results);
	const allSuccess = results.every(([_, result]) => result.success);

	if (allSuccess) {
		console.log(' All services are healthy');
	} else {
		console.error(' Some services failed health checks');
		results.forEach(([name, result]) => {
			if (!result.success) {
				console.error(`  - ${name}: ${result.error}`);
			}
		});
	}

	return {
		success: allSuccess,
		results: resultMap,
	};
}
