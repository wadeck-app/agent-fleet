// Terminal-Kit implementation of Timeline View
import {
	formatDuration,
	formatStepDuration,
	formatTime,
	getLogEmoji,
	getLogLevelColor,
	truncate,
} from '../../shared/formatters.js';
import type { UIState } from '../../shared/types.js';
import { drawDoubleBox, drawSingleBox, getTermKitColor } from './helpers.js';

export class TimelineView {
	static render(screenBuffer: any, state: UIState, termWidth: number, termHeight: number): void {
		const { workerId, taskId, flowName, connected, paused } = state;
		const { steps, logs, elapsedSeconds, retryCount, workspaceDir } = state;

		const timelineHeight = Math.min(14, Math.floor(termHeight * 0.35));
		const logAreaHeight = Math.max(10, termHeight - timelineHeight - 6);
		const displayLogs = logs.slice(-Math.max(6, logAreaHeight - 3));

		let currentY = 1;

		// ═══ Header ═══
		drawDoubleBox(screenBuffer, 1, currentY, termWidth - 2, 3, 'cyan');
		screenBuffer.put(
			{ x: 3, y: currentY + 1 },
			`FlowWorker: ${workerId || '?'} │ ${flowName || 'No flow'} │ Task ${taskId || 'idle'}`
		);

		currentY += 4;

		// ═══ Timeline Section (Gantt Chart) ═══
		drawSingleBox(screenBuffer, 1, currentY, termWidth - 2, timelineHeight, 'cyan');
		screenBuffer.put({ x: 3, y: currentY, attr: { color: 'cyan' } }, '┤ Gantt Timeline ├');

		if (taskId && steps.length > 0) {
			// Calculate time scale for Gantt chart
			const firstStart = Math.min(...steps.filter(s => s.startTime).map(s => s.startTime!));
			const now = Date.now();
			const totalElapsed = (now - firstStart) / 1000; // seconds
			const timeScale = totalElapsed > 0 ? 60 / totalElapsed : 60 / 24; // 60 chars for the timeline

			// Time markers
			const maxTime = Math.ceil(totalElapsed);
			const markers = [];
			for (let t = 0; t <= maxTime && t <= 24; t += 3) {
				markers.push(`${t}s`.padEnd(8, ' '));
			}
			screenBuffer.put({ x: 3, y: currentY + 2, attr: { color: 'gray' } }, markers.join(''));

			// Step Gantt bars
			let barY = currentY + 3;
			for (const step of steps) {
				if (barY + 1 >= currentY + timelineHeight - 1) break;

				const stepStart = step.startTime ? (step.startTime - firstStart) / 1000 : 0;
				const duration = (step.durationMs || 0) / 1000;
				const barStartX = 3 + Math.floor(stepStart * timeScale);
				const barLength = Math.max(1, Math.floor(duration * timeScale));

				let bar = '';
				if (step.status === 'completed') {
					bar = '▓'.repeat(barLength);
				} else if (step.status === 'failed') {
					bar = '▓'.repeat(Math.max(1, barLength - 1)) + '✗';
				} else if (step.status === 'running') {
					bar = '▓'.repeat(Math.max(1, Math.floor(barLength * 0.7))) + '▶';
				} else {
					bar = '░'.repeat(barLength);
				}

				const color =
					step.status === 'completed'
						? 'green'
						: step.status === 'failed'
							? 'red'
							: step.status === 'running'
								? 'yellow'
								: 'gray';
				screenBuffer.put({ x: barStartX, y: barY, attr: { color } }, bar);
				barY++;
				const statusIcon =
					step.status === 'completed'
						? '✓'
						: step.status === 'failed'
							? '✗'
							: step.status === 'running'
								? '▶'
								: '';
				const stepLine = `${truncate(step.name, 18)} (${statusIcon}) ${formatStepDuration(step.durationMs)}`;
				screenBuffer.put({ x: 3, y: barY, attr: { color } }, truncate(stepLine, termWidth - 10));
				barY++;
			}
		} else {
			screenBuffer.put(
				{ x: Math.floor(termWidth / 2) - 10, y: currentY + 5, attr: { color: 'gray' } },
				'No active flow'
			);
		}

		currentY += timelineHeight;

		// ═══ Live Output ═══
		drawSingleBox(screenBuffer, 1, currentY, termWidth - 2, logAreaHeight, 'cyan');
		screenBuffer.put({ x: 3, y: currentY, attr: { color: 'cyan' } }, '┤ Live Output ├');

		let logY = currentY + 1;
		if (displayLogs.length === 0) {
			screenBuffer.put(
				{ x: Math.floor(termWidth / 2) - 10, y: logY + 2, attr: { color: 'gray' } },
				'No output yet...'
			);
		} else {
			for (const log of displayLogs) {
				if (logY >= currentY + logAreaHeight - 1) break;
				const isStepLog = log.message.startsWith('  [');
				const emoji = isStepLog ? '' : getLogEmoji(log) + ' ';
				const color = getTermKitColor(getLogLevelColor(log.level));
				screenBuffer.put({ x: 3, y: logY }, emoji);
				screenBuffer.put(
					{ x: 3 + emoji.length, y: logY, attr: { color } },
					log.message.substring(0, termWidth - 10)
				);
				logY++;
			}
		}

		currentY += logAreaHeight + 1;

		// ═══ Footer Stats ═══
		screenBuffer.put({ x: 2, y: currentY, attr: { color: 'gray' } }, 'Stats: ');
		screenBuffer.put(
			{ x: 9, y: currentY },
			`${steps.filter(s => s.status === 'completed').length}/${steps.length} steps`
		);
		screenBuffer.put({ x: 25, y: currentY }, `│ ${formatDuration(elapsedSeconds)} elapsed`);
		screenBuffer.put({ x: 45, y: currentY }, `│ ${retryCount} retry`);
		const ws = workspaceDir ? truncate(workspaceDir, 30) : 'No workspace';
		screenBuffer.put({ x: 60, y: currentY, attr: { dimColor: true } }, `│ ${ws}`);
		screenBuffer.put(
			{ x: termWidth - 20, y: currentY, attr: { color: connected ? 'green' : 'red' } },
			`│ Connected ${connected ? '✓' : '✗'}`
		);

		currentY++;
		const hint = `View: [3] Timeline View | Press 1-5 to switch, P to ${paused ? 'resume' : 'pause'}, Q to quit`;
		screenBuffer.put({ x: 2, y: currentY, attr: { color: 'gray', dim: true } }, hint);
		if (paused) {
			screenBuffer.put({ x: 2 + hint.length, y: currentY, attr: { color: 'yellow', bold: true } }, ' [PAUSED]');
		}
	}
}
