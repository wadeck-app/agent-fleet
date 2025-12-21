// Shared helpers for terminal-kit views

// Draw a double-line box
export function drawDoubleBox(
	screenBuffer: any,
	x: number,
	y: number,
	width: number,
	height: number,
	color: string
): void {
	screenBuffer.put({ x, y, attr: { color } }, '╔' + '═'.repeat(width - 2) + '╗');
	for (let i = 1; i < height - 1; i++) {
		screenBuffer.put({ x, y: y + i, attr: { color } }, '║');
		screenBuffer.put({ x: x + width - 1, y: y + i, attr: { color } }, '║');
	}
	screenBuffer.put({ x, y: y + height - 1, attr: { color } }, '╚' + '═'.repeat(width - 2) + '╝');
}

// Draw a single-line box
export function drawSingleBox(
	screenBuffer: any,
	x: number,
	y: number,
	width: number,
	height: number,
	color: string
): void {
	screenBuffer.put({ x, y, attr: { color } }, '┌' + '─'.repeat(width - 2) + '┐');
	for (let i = 1; i < height - 1; i++) {
		screenBuffer.put({ x, y: y + i, attr: { color } }, '│');
		screenBuffer.put({ x: x + width - 1, y: y + i, attr: { color } }, '│');
	}
	screenBuffer.put({ x, y: y + height - 1, attr: { color } }, '└' + '─'.repeat(width - 2) + '┘');
}

// Map color names to terminal-kit colors
export function getTermKitColor(color: string): string {
	const colorMap: Record<string, string> = {
		green: 'green',
		red: 'red',
		yellow: 'yellow',
		gray: 'gray',
		white: 'white',
		cyan: 'cyan',
		magenta: 'magenta',
	};
	return colorMap[color] || 'white';
}

// Draw colored flow progress icons
export function drawFlowProgress(screenBuffer: any, x: number, y: number, steps: any[]): void {
	let flowX = x;
	for (const step of steps) {
		const icon =
			step.status === 'completed' ? '●' : step.status === 'running' ? '◐' : step.status === 'failed' ? '●' : '○';
		const color =
			step.status === 'completed'
				? 'green'
				: step.status === 'failed'
					? 'red'
					: step.status === 'running'
						? 'yellow'
						: 'gray';
		screenBuffer.put({ x: flowX, y, attr: { color } }, icon);
		flowX += 2;
	}
}
