// Terminal-Kit implementation of Full Screen Logs view
import { formatDuration, formatTime, getLogEmoji, getLogLevelColor, truncate } from '../../shared/formatters.js';
import type { UIState } from '../../shared/types.js';
import { drawDoubleBox, drawSingleBox, getTermKitColor } from './helpers.js';

export class FullScreenLogs {
	static render(screenBuffer: any, state: UIState, termWidth: number, termHeight: number): void {
		const { workerId, taskId, flowName, connected, paused } = state;
		const { steps, logs, elapsedSeconds, retryCount, currentStepIndex, totalSteps } = state;

		// Calculate heights
		const logAreaHeight = Math.max(15, termHeight - 13);
		const displayLogs = logs.slice(-Math.max(10, logAreaHeight - 5));

		const currentStep = steps[currentStepIndex];

		let currentY = 1;

		// ═══ Header (Double Border) ═══
		drawDoubleBox(screenBuffer, 1, currentY, termWidth - 2, 4, 'cyan');

		// Header Line 1: Worker ID and Connection
		screenBuffer.put(
			{ x: 3, y: currentY + 1, attr: { color: 'cyan', bold: true } },
			`FlowWorker: ${workerId || '?'}`
		);
		screenBuffer.put({ x: termWidth - 40, y: currentY + 1 }, 'Connected: ');
		screenBuffer.put(
			{ x: termWidth - 28, y: currentY + 1, attr: { color: connected ? 'green' : 'red' } },
			connected ? 'ws://localhost:3738' : 'Disconnected'
		);

		// Header Line 2: Task Info
		const taskText = `Task: ${taskId ? truncate(taskId, 20) : 'idle'} │ Flow: ${flowName ? truncate(flowName, 25) : 'No flow'}`;
		screenBuffer.put({ x: 3, y: currentY + 2, attr: { color: 'cyan' } }, taskText);

		const stepText = `Step ${currentStepIndex + 1}/${totalSteps}: ${currentStep?.name ? truncate(currentStep.name, 20) : 'None'} [${currentStep?.status.toUpperCase() || 'IDLE'}] │ ↺ ${retryCount} │ ${formatDuration(elapsedSeconds)}`;
		screenBuffer.put({ x: termWidth - stepText.length - 3, y: currentY + 2 }, stepText);

		currentY += 5;

		// ═══ Log Area (Single Border) ═══
		drawSingleBox(screenBuffer, 1, currentY, termWidth - 2, logAreaHeight, 'cyan');

		// Log Area Title
		const logTitle = '════ EXECUTION LOG ════';
		const titleX = Math.floor((termWidth - logTitle.length) / 2);
		screenBuffer.put({ x: titleX, y: currentY + 1, attr: { color: 'cyan', bold: true } }, logTitle);

		// Logs
		if (displayLogs.length === 0) {
			const waitText = 'Waiting for flow execution...';
			const waitX = Math.floor((termWidth - waitText.length) / 2);
			screenBuffer.put(
				{ x: waitX, y: currentY + Math.floor(logAreaHeight / 2), attr: { color: 'gray' } },
				waitText
			);
		} else {
			let logY = currentY + 3;
			for (const log of displayLogs) {
				if (logY >= currentY + logAreaHeight - 1) break;

				const isStepLog = log.message.startsWith('  [');
				const timestamp = formatTime(log.timestamp);
				const emoji = isStepLog ? '' : getLogEmoji(log) + ' ';
				const color = getTermKitColor(getLogLevelColor(log.level));

				screenBuffer.put({ x: 3, y: logY, attr: { color: 'gray' } }, timestamp);
				screenBuffer.put({ x: 12, y: logY }, emoji);
				screenBuffer.put(
					{ x: 12 + emoji.length, y: logY, attr: { color } },
					truncate(log.message, termWidth - 15 - emoji.length)
				);

				logY++;
			}
		}

		currentY += logAreaHeight + 1;

		// ═══ Footer Status Bar (Double Border) ═══
		drawDoubleBox(screenBuffer, 1, currentY, termWidth - 2, 3, 'cyan');

		screenBuffer.put({ x: 3, y: currentY + 1, attr: { color: 'gray' } }, 'Flow: ');
		let flowX = 9;
		for (const step of steps) {
			const icon =
				step.status === 'completed'
					? '●'
					: step.status === 'running'
						? '◐'
						: step.status === 'failed'
							? '●'
							: '○';
			const color =
				step.status === 'completed'
					? 'green'
					: step.status === 'failed'
						? 'red'
						: step.status === 'running'
							? 'yellow'
							: 'gray';
			screenBuffer.put({ x: flowX, y: currentY + 1, attr: { color } }, icon);
			flowX += 2;
		}

		const wsText = `WS: ${connected ? 'Connected' : 'Disconnected'}`;
		screenBuffer.put(
			{ x: termWidth - wsText.length - 3, y: currentY + 1, attr: { color: connected ? 'green' : 'red' } },
			wsText
		);

		currentY += 4;

		// ═══ Footer Hint ═══
		const hintText = `View: [4] Full Screen Logs | Press 1-5 to switch, P to ${paused ? 'resume' : 'pause'}, Q to quit`;
		const pausedText = paused ? ' [PAUSED - Copy/Paste enabled]' : '';
		screenBuffer.put({ x: 2, y: currentY, attr: { color: 'gray', dim: true } }, hintText);
		if (paused) {
			screenBuffer.put(
				{ x: 2 + hintText.length, y: currentY, attr: { color: 'yellow', bold: true } },
				pausedText
			);
		}
	}
}
