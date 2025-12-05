// Design 4: Full Screen Logs (Log-Focused)

import React, { useMemo } from 'react';
import { Box, Text, Static } from 'ink';
import type { ViewProps } from '../../shared/types.js';
import { formatDuration, formatTime, getStepStatusEmoji, getLogEmoji, getLogLevelColor, getViewNumber, getViewName, truncate } from '../../shared/formatters.js';

export const FullScreenLogs = React.memo(function FullScreenLogs({ state, currentView, terminalHeight }: ViewProps): React.ReactElement {
  const { workerId, taskId, flowName, connected, paused } = state;
  const { steps, logs, elapsedSeconds, retryCount, currentStepIndex, totalSteps } = state;

  // Calculate fixed height for log area (subtract header=4 + footer=2 + status=3 + hint=1 + borders=3)
  const logAreaHeight = Math.max(15, terminalHeight - 13);

  // Get last N logs to fill the screen
  const displayLogs = logs.slice(-Math.max(10, logAreaHeight - 5));

  const currentStep = steps[currentStepIndex];
  const stepSummary = useMemo(() => steps.map(s => {
    if (s.status === 'completed') return '●';
    if (s.status === 'running') return '◐';
    return '○';
  }).join(' '), [steps]);

  // Memoize header content to minimize re-renders
  const headerLine1 = useMemo(() => `FlowWorker: ${workerId || '?'}`, [workerId]);
  const headerLine2Left = useMemo(() =>
    `Task: ${taskId ? truncate(taskId, 20) : 'idle'} │ Flow: ${flowName ? truncate(flowName, 25) : 'No flow'}`,
    [taskId, flowName]
  );
  const headerLine2Right = useMemo(() =>
    `Step ${currentStepIndex + 1}/${totalSteps}: ${currentStep?.name ? truncate(currentStep.name, 20) : 'None'} [${currentStep?.status.toUpperCase() || 'IDLE'}] │ ↺ ${retryCount} │ ${formatDuration(elapsedSeconds)}`,
    [currentStepIndex, totalSteps, currentStep, retryCount, elapsedSeconds]
  );

  return (
    <Box flexDirection="column" width="100%" height={terminalHeight} minHeight={terminalHeight}>
      {/* Header - Always 2 lines for stability */}
      <Box borderStyle="double" borderColor="cyan" paddingX={1}>
        <Box flexDirection="column">
          {/* Line 1: Worker ID */}
          <Text>
            <Text color="cyan" bold>{headerLine1}</Text>
            <Text>    Connected: </Text>
            <Text color={connected ? 'green' : 'red'}>{connected ? 'ws://localhost:3738' : 'Disconnected'}</Text>
          </Text>
          {/* Line 2: Task Info */}
          <Text>
            <Text color="cyan">{headerLine2Left}</Text>
            <Text>  {headerLine2Right}</Text>
          </Text>
        </Box>
      </Box>

      {/* Main Log Area */}
      <Box flexDirection="column" paddingX={2} height={logAreaHeight} borderStyle="single" borderColor="cyan">
        <Box justifyContent="center" marginY={1}>
          <Text color="cyan" bold>════ EXECUTION LOG ════</Text>
        </Box>

        <Box flexDirection="column">
          {displayLogs.length === 0 ? (
            <Box justifyContent="center" marginTop={5}>
              <Text color="gray">Waiting for flow execution...</Text>
            </Box>
          ) : (
            displayLogs.map((log, idx) => {
              const isStepLog = log.message.startsWith('  [');

              return (
                <Box key={`log-${idx}-${log.timestamp}`} flexDirection="row" gap={1}>
                  <Text color="gray">{formatTime(log.timestamp)}</Text>
                  {!isStepLog && (
                    <Text>
                      {getLogEmoji(log)}
                    </Text>
                  )}
                  <Text color={getLogLevelColor(log.level)}>
                    {log.message}
                  </Text>
                </Box>
              );
            })
          )}
        </Box>
      </Box>

      {/* Footer Status Bar */}
      <Box borderStyle="double" borderColor="cyan" paddingX={1}>
        <Box flexDirection="row" width="100%" justifyContent="space-between">
          <Text>
            <Text color="gray">Flow: </Text>
            <Text>{stepSummary}</Text>
          </Text>
          <Text>
            <Text color="gray">WS: </Text>
            <Text color={connected ? 'green' : 'red'}>{connected ? 'Connected' : 'Disconnected'}</Text>
          </Text>
        </Box>
      </Box>

      {/* Footer hint */}
      <Box paddingX={1}>
        <Text color="gray" dimColor>
          View: [{getViewNumber(currentView)}] {getViewName(currentView)} | Press 1-5 to switch, P to {paused ? 'resume' : 'pause'}, Q to quit
          {paused && <Text color="yellow" bold> [PAUSED - Copy/Paste enabled]</Text>}
        </Text>
      </Box>
    </Box>
  );
});
