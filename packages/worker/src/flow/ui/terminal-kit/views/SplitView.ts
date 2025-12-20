// Terminal-Kit implementation of Split View (left: status, right: logs)

import type { UIState } from '../../shared/types.js';
import { formatDuration, formatTime, getStepStatusIcon, getLogEmoji, getLogLevelColor, truncate, formatStepDuration } from '../../shared/formatters.js';
import { drawSingleBox, drawDoubleBox, getTermKitColor } from './helpers.js';

export class SplitView {
  static render(screenBuffer: any, state: UIState, termWidth: number, termHeight: number): void {
    const { workerId, taskId, flowName, connected, paused } = state;
    const { steps, logs, elapsedSeconds, retryCount, workspaceDir, currentStepIndex, totalSteps } = state;

    const leftWidth = 35;
    const rightWidth = termWidth - leftWidth - 3;
    const logAreaHeight = Math.max(12, termHeight - 10);
    const displayLogs = logs.slice(-Math.max(8, logAreaHeight - 4));

    let currentY = 1;

    // ═══ Header ═══
    drawDoubleBox(screenBuffer, 1, currentY, termWidth - 2, 3, 'cyan');
    screenBuffer.put({ x: 3, y: currentY + 1, attr: { color: 'cyan', bold: true } },
      `FlowWorker: ${workerId || '?'} │ Task: ${taskId ? truncate(taskId, 20) : 'idle'} │ ${flowName ? truncate(flowName, 30) : 'No flow'}`
    );

    currentY += 4;

    // ═══ Left Panel: Status ═══
    drawSingleBox(screenBuffer, 1, currentY, leftWidth, logAreaHeight, 'cyan');
    screenBuffer.put({ x: 3, y: currentY, attr: { color: 'cyan' } }, '┤ Flow Status ├');

    let leftY = currentY + 2;
    screenBuffer.put({ x: 3, y: leftY++, attr: { color: 'yellow', bold: true } }, '» Current Step');
    const currentStep = steps[currentStepIndex];
    if (currentStep) {
      screenBuffer.put({ x: 3, y: leftY++ }, `  ${truncate(currentStep.name, 28)}`);
      screenBuffer.put({ x: 3, y: leftY++, attr: { color: 'cyan' } }, `  [${currentStep.status.toUpperCase()}]`);
    } else {
      screenBuffer.put({ x: 3, y: leftY++, attr: { color: 'gray' } }, '  No active step');
    }

    leftY++;
    screenBuffer.put({ x: 3, y: leftY++, attr: { color: 'yellow', bold: true } }, '» Progress');
    screenBuffer.put({ x: 3, y: leftY++ }, `  Step ${currentStepIndex + 1}/${totalSteps}`);
    screenBuffer.put({ x: 3, y: leftY++, attr: { color: 'cyan', bold: true } }, `  ${formatDuration(elapsedSeconds)}`);

    leftY++;
    screenBuffer.put({ x: 3, y: leftY++, attr: { color: 'yellow', bold: true } }, '» Steps');
    const visibleSteps = steps.slice(0, 6);
    for (const step of visibleSteps) {
      const icon = getStepStatusIcon(step.status);
      const color = step.status === 'completed' ? 'green' : step.status === 'failed' ? 'red' : step.status === 'running' ? 'yellow' : 'gray';
      screenBuffer.put({ x: 3, y: leftY, attr: { color } }, icon);
      screenBuffer.put({ x: 5, y: leftY }, truncate(step.name, 26));
      leftY++;
    }
    if (steps.length > 6) {
      screenBuffer.put({ x: 3, y: leftY++, attr: { color: 'gray' } }, `  ...${steps.length - 6} more`);
    }

    // ═══ Right Panel: Logs ═══
    drawSingleBox(screenBuffer, leftWidth + 2, currentY, rightWidth, logAreaHeight, 'cyan');
    screenBuffer.put({ x: leftWidth + 4, y: currentY, attr: { color: 'cyan' } }, '┤ Live Log ├');

    let rightY = currentY + 1;
    for (const log of displayLogs) {
      if (rightY >= currentY + logAreaHeight - 1) break;
      const isStepLog = log.message.startsWith('  [');
      const emoji = isStepLog ? '' : getLogEmoji(log) + ' ';
      const color = getTermKitColor(getLogLevelColor(log.level));
      screenBuffer.put({ x: leftWidth + 4, y: rightY, attr: { color: 'gray' } }, formatTime(log.timestamp).substring(0, 8));
      screenBuffer.put({ x: leftWidth + 13, y: rightY }, emoji);
      screenBuffer.put({ x: leftWidth + 13 + emoji.length, y: rightY, attr: { color } },
        truncate(log.message, rightWidth - 15)
      );
      rightY++;
    }

    currentY += logAreaHeight + 1;

    // ═══ Footer ═══
    drawDoubleBox(screenBuffer, 1, currentY, termWidth - 2, 3, 'cyan');
    screenBuffer.put({ x: 3, y: currentY + 1, attr: { color: 'gray' } }, `↺ ${retryCount} │ `);
    screenBuffer.put({ x: 10 + retryCount.toString().length, y: currentY + 1, attr: { color: connected ? 'green' : 'red' } },
      connected ? 'Connected ✓' : 'Disconnected ✗'
    );

    currentY += 4;
    const hint = `View: [1] Split View | Press 1-5 to switch, P to ${paused ? 'resume' : 'pause'}, Q to quit`;
    screenBuffer.put({ x: 2, y: currentY, attr: { color: 'gray', dim: true } }, hint);
    if (paused) {
      screenBuffer.put({ x: 2 + hint.length, y: currentY, attr: { color: 'yellow', bold: true } }, ' [PAUSED]');
    }
  }
}
