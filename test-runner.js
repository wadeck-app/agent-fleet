const { execSync } = require('child_process');

try {
	const result = execSync('npm test -- usePanelLayout.test.tsx', {
		cwd: 'C:\\Workspace_Tooling\\agent-fleet',
		encoding: 'utf-8',
		stdio: 'pipe',
		windowsHide: true,
	});
	console.log(result);
} catch (error) {
	console.log(error.stdout);
	console.log(error.stderr);
	process.exit(error.status);
}
