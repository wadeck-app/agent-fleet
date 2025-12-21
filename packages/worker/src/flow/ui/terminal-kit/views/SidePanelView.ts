// Terminal-Kit implementation of Side Panel View (modern split)
import {
	formatDuration,
	formatPercentage,
	formatStepDuration,
	formatTime,
	getLogEmoji,
	getLogLevelColor,
	getStepStatusIcon,
	progressBar,
	truncate,
} from '../../shared/formatters.js';
import type { UIState } from '../../shared/types.js';
import { drawSingleBox, getTermKitColor } from './helpers.js';

export class SidePanelView {
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

		const leftWidth = 35;
		const rightWidth = termWidth - leftWidth - 1;
		const logAreaHeight = Math.max(20, termHeight - 5);
		const displayLogs = logs.slice(-Math.max(12, logAreaHeight - 3));

		const currentStep = steps[currentStepIndex];
		const completedSteps = steps.filter(s => s.status === 'completed').length;

		// ETA calculation
		const avgStepTime =
			steps.filter(s => s.durationMs).reduce((sum, s) => sum + (s.durationMs || 0), 0) /
			Math.max(1, completedSteps);
		const remainingSteps = totalSteps - completedSteps;
		const etaSeconds = Math.floor((avgStepTime * remainingSteps) / 1000);

		// ═══ Left Side Panel ═══
		drawSingleBox(screenBuffer, 1, 1, leftWidth, termHeight - 2, 'cyan');
		let leftY = 2;

		screenBuffer.put({ x: 3, y: leftY++, attr: { color: 'cyan', bold: true } }, workerId);
		screenBuffer.put(
			{ x: 3, y: leftY++, attr: { color: connected ? 'green' : 'red' } },
			connected ? 'Connected ●' : 'Disconnected ○'
		);
		leftY++;

		// Current Task
		screenBuffer.put({ x: 3, y: leftY++, attr: { color: 'yellow', bold: true } }, '» Current Task');
		screenBuffer.put({ x: 3, y: leftY++ }, `ID:   ${taskId ? truncate(taskId, 23) : 'None'}`);
		screenBuffer.put({ x: 3, y: leftY++ }, `Flow: ${truncate(flowName || 'None', 23)}`);
		screenBuffer.put({ x: 3, y: leftY++ }, `Step: ${currentStepIndex + 1}/${totalSteps}`);
		leftY++;

		// Progress
		screenBuffer.put({ x: 3, y: leftY++, attr: { color: 'yellow', bold: true } }, '» Progress');
		screenBuffer.put({ x: 3, y: leftY++, attr: { color: 'cyan' } }, progressBar(completedSteps, totalSteps, 20));
		screenBuffer.put({ x: 3, y: leftY++, attr: { color: 'cyan' } }, formatPercentage(completedSteps, totalSteps));
		if (taskId && etaSeconds > 0) {
			screenBuffer.put({ x: 3, y: leftY++ }, `ETA: ~${formatDuration(etaSeconds)}`);
		}
		leftY++;

		// Duration
		screenBuffer.put({ x: 3, y: leftY++, attr: { color: 'yellow', bold: true } }, '» Duration');
		screenBuffer.put({ x: 3, y: leftY++, attr: { color: 'cyan', bold: true } }, formatDuration(elapsedSeconds));
		leftY++;

		// Retries
		screenBuffer.put({ x: 3, y: leftY++, attr: { color: 'yellow', bold: true } }, '» Retries: ');
		screenBuffer.put(
			{ x: 13, y: leftY - 1, attr: { color: retryCount > 0 ? 'yellow' : 'white' } },
			retryCount.toString()
		);
		leftY++;

		// Workspace
		screenBuffer.put({ x: 3, y: leftY++, attr: { color: 'yellow', bold: true } }, '» Workspace');
		screenBuffer.put({ x: 3, y: leftY++, attr: { dimColor: true } }, truncate(workspaceDir || 'None', 28));
		leftY++;

		// Steps List
		screenBuffer.put({ x: 3, y: leftY++, attr: { color: 'yellow', bold: true } }, '» Steps');
		if (steps.length === 0) {
			screenBuffer.put({ x: 3, y: leftY++, attr: { color: 'gray' } }, 'No steps');
		} else {
			for (const step of steps) {
				if (leftY >= termHeight - 5) break;
				const icon = getStepStatusIcon(step.status);
				const color =
					step.status === 'completed'
						? 'green'
						: step.status === 'failed'
							? 'red'
							: step.status === 'running'
								? 'yellow'
								: 'gray';
				screenBuffer.put({ x: 3, y: leftY, attr: { color } }, icon);
				screenBuffer.put(
					{ x: 5, y: leftY, attr: { color: step.status === 'running' ? 'yellow' : 'white' } },
					truncate(step.name, 15)
				);
				screenBuffer.put(
					{ x: 22, y: leftY, attr: { color: 'cyan', dimColor: true } },
					formatStepDuration(step.durationMs) + (step.status === 'running' ? '...' : '')
				);
				leftY++;
			}
		}

		// Output/Error Count
		leftY = termHeight - 4;
		screenBuffer.put({ x: 3, y: leftY++, attr: { color: 'yellow', bold: true } }, '» Outputs: ');
		screenBuffer.put({ x: 14, y: leftY - 1 }, outputCount.toString());
		screenBuffer.put({ x: 3, y: leftY++, attr: { color: 'yellow', bold: true } }, '» Errors: ');
		screenBuffer.put(
			{ x: 13, y: leftY - 1, attr: { color: errorCount > 0 ? 'red' : 'white' } },
			errorCount.toString()
		);

		// ═══ Right Main Panel - Logs ═══
		drawSingleBox(screenBuffer, leftWidth + 1, 1, rightWidth, logAreaHeight + 2, 'cyan');
		// Put title in the top border
		screenBuffer.put({ x: leftWidth + 3, y: 1, attr: { color: 'cyan', bold: true } }, '┤ Execution Log ├');

		let logY = 2;
		if (displayLogs.length === 0) {
			screenBuffer.put(
				{ x: leftWidth + Math.floor(rightWidth / 2) - 10, y: logY + 5, attr: { color: 'gray' } },
				'No logs yet...'
			);
		} else {
			for (const log of displayLogs) {
				if (logY >= 1 + logAreaHeight + 1) break;
				const isStepLog = log.message.startsWith('  [');
				const emoji = isStepLog ? '' : getLogEmoji(log) + ' ';
				const color = getTermKitColor(getLogLevelColor(log.level));
				screenBuffer.put(
					{ x: leftWidth + 3, y: logY, attr: { color: 'gray' } },
					formatTime(log.timestamp).substring(0, 8)
				);
				screenBuffer.put({ x: leftWidth + 12, y: logY }, emoji);
				screenBuffer.put(
					{ x: leftWidth + 12 + emoji.length, y: logY, attr: { color } },
					log.message.substring(0, rightWidth - 15)
				);
				logY++;
			}
		}

		// Footer hint
		const hintY = termHeight - 1;
		const hint = `View: [5] Side Panel | Press 1-5 to switch, P to ${paused ? 'resume' : 'pause'}, Q to quit`;
		screenBuffer.put({ x: leftWidth + 2, y: hintY, attr: { color: 'gray', dim: true } }, hint);
		if (paused) {
			screenBuffer.put(
				{ x: leftWidth + 2 + hint.length, y: hintY, attr: { color: 'yellow', bold: true } },
				' [PAUSED]'
			);
		}
	}
}
