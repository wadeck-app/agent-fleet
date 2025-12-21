// Terminal-Kit implementation of Compact Dashboard
import {
	formatDuration,
	formatPercentage,
	formatTime,
	getLogEmoji,
	getLogLevelColor,
	getStepStatusIcon,
	progressBar,
	truncate,
} from '../../shared/formatters.js';
import type { UIState } from '../../shared/types.js';
import { drawDoubleBox, drawSingleBox, getTermKitColor } from './helpers.js';

export class CompactDashboard {
	static render(screenBuffer: any, state: UIState, termWidth: number, termHeight: number): void {
		const { workerId, taskId, flowName, connected, paused } = state;
		const {
			steps,
			logs,
			elapsedSeconds,
			retryCount,
			workspaceDir,
			currentStepIndex,
			totalSteps,
			outputCount,
			errorCount,
		} = state;

		const logAreaHeight = Math.max(12, termHeight - 12);
		const displayLogs = logs.slice(-Math.max(8, logAreaHeight - 4));

		const currentStep = steps[currentStepIndex];

		let currentY = 1;

		// ═══ Header ═══
		drawDoubleBox(screenBuffer, 1, currentY, termWidth - 2, 3, 'cyan');
		const headerText = `FlowWorker: ${workerId} │ Task: ${taskId ? truncate(taskId, 20) : 'idle'} │ ${truncate(flowName || 'No flow', 30)}`;
		screenBuffer.put({ x: 3, y: currentY + 1 }, truncate(headerText, termWidth - 6));

		currentY += 3;

		// ═══ Flow DAG and Stats ═══
		drawSingleBox(screenBuffer, 1, currentY, termWidth - 2, 4, 'gray');
		screenBuffer.put({ x: 3, y: currentY + 1, attr: { color: 'cyan' } }, 'Flow DAG: ');

		if (taskId && steps.length > 0) {
			let dagX = 13;
			for (let i = 0; i < steps.length && dagX < termWidth - 25; i++) {
				const step = steps[i];
				const color =
					step.status === 'completed'
						? 'green'
						: step.status === 'failed'
							? 'red'
							: step.status === 'running'
								? 'yellow'
								: 'gray';
				screenBuffer.put({ x: dagX, y: currentY + 1, attr: { color } }, '[●]');
				dagX += 3;
				if (i < steps.length - 1 && dagX < termWidth - 25) {
					screenBuffer.put({ x: dagX, y: currentY + 1, attr: { color: 'gray' } }, '─→');
					dagX += 2;
				}
			}
		} else {
			screenBuffer.put({ x: 13, y: currentY + 1, attr: { color: 'gray' } }, 'No active flow');
		}

		screenBuffer.put(
			{ x: termWidth - 20, y: currentY + 1, attr: { color: 'cyan' } },
			formatDuration(elapsedSeconds)
		);
		screenBuffer.put(
			{ x: termWidth - 10, y: currentY + 1, attr: { color: retryCount > 0 ? 'yellow' : 'white' } },
			`↻ ${retryCount}`
		);

		const progressText = progressBar(currentStepIndex + 1, totalSteps, 16);
		screenBuffer.put({ x: 3, y: currentY + 2, attr: { color: 'yellow' } }, 'Current Step: ');
		screenBuffer.put({ x: 17, y: currentY + 2, attr: { bold: true } }, currentStep?.name || 'None');
		screenBuffer.put(
			{ x: termWidth - 30, y: currentY + 2, attr: { color: 'gray' } },
			`(${currentStepIndex + 1}/${totalSteps})`
		);
		screenBuffer.put({ x: termWidth - 24, y: currentY + 2, attr: { color: 'cyan' } }, progressText);
		screenBuffer.put(
			{ x: termWidth - 6, y: currentY + 2, attr: { color: 'cyan' } },
			formatPercentage(currentStepIndex + 1, totalSteps)
		);

		currentY += 4;

		// ═══ Logs Section ═══
		drawSingleBox(screenBuffer, 1, currentY, termWidth - 2, logAreaHeight, 'cyan');
		// Put LOGS in the top border (same color as border)
		screenBuffer.put({ x: 4, y: currentY, attr: { color: 'cyan' } }, '┤ LOGS ├');

		let logY = currentY + 1;
		if (displayLogs.length === 0) {
			screenBuffer.put(
				{ x: Math.floor(termWidth / 2) - 10, y: logY + 3, attr: { color: 'gray' } },
				'No logs yet...'
			);
		} else {
			for (const log of displayLogs) {
				if (logY >= currentY + logAreaHeight - 1) break;
				const isStepLog = log.message.startsWith('  [');
				const emoji = isStepLog ? '' : getLogEmoji(log) + ' ';
				const color = getTermKitColor(getLogLevelColor(log.level));
				screenBuffer.put({ x: 4, y: logY, attr: { color: 'gray' } }, formatTime(log.timestamp).substring(0, 8));
				screenBuffer.put({ x: 13, y: logY }, emoji);
				screenBuffer.put(
					{ x: 13 + emoji.length, y: logY, attr: { color } },
					log.message.substring(0, termWidth - 20)
				);
				logY++;
			}
		}

		currentY += logAreaHeight;

		// ═══ Footer Status Bar ═══
		drawSingleBox(screenBuffer, 1, currentY, termWidth - 2, 3, 'cyan');
		const workspace = workspaceDir
			? workspaceDir.length > 20
				? '...' + workspaceDir.slice(-20)
				: workspaceDir
			: 'No workspace';
		screenBuffer.put({ x: 3, y: currentY + 1, attr: { dimColor: true } }, workspace);
		screenBuffer.put(
			{ x: termWidth - 40, y: currentY + 1, attr: { color: connected ? 'green' : 'red' } },
			connected ? 'Connected' : 'Disconnected'
		);
		screenBuffer.put({ x: termWidth - 20, y: currentY + 1 }, `Out: ${outputCount} │ Err: ${errorCount}`);

		currentY += 3;
		const hint = `View: [2] Compact Dashboard | Press 1-5 to switch, P to ${paused ? 'resume' : 'pause'}, Q to quit`;
		screenBuffer.put({ x: 2, y: currentY, attr: { color: 'gray', dim: true } }, hint);
		if (paused) {
			screenBuffer.put({ x: 2 + hint.length, y: currentY, attr: { color: 'yellow', bold: true } }, ' [PAUSED]');
		}
	}
}
