// Design 2: Compact Dashboard (Information Dense)

import React from 'react';
import { Box, Text } from 'ink';
import type { ViewProps } from '../../shared/types.js';
import { formatDuration, formatTime, getStepStatusIcon, getLogEmoji, getLogLevelColor, progressBar, formatPercentage, getViewNumber, getViewName } from '../../shared/formatters.js';

export function CompactDashboard({ state, currentView, terminalHeight }: ViewProps): React.ReactElement {
  const { workerId, taskId, flowName, connected, paused } = state;
  const { steps, logs, elapsedSeconds, retryCount, workspaceDir, currentStepIndex, totalSteps, outputCount, errorCount } = state;

  // Calculate fixed height for logs
  const logAreaHeight = Math.max(12, terminalHeight - 12);

  // Get last N logs
  const displayLogs = logs.slice(-Math.max(8, logAreaHeight - 4));

  // Build DAG visualization
  const dagSteps = steps.map(s => getStepStatusIcon(s.status) === '✓' ? '[●]' : getStepStatusIcon(s.status) === '▶' ? '[●]' : '[○]');
  const dagViz = dagSteps.join('─→');

  const currentStep = steps[currentStepIndex];
  const progress = totalSteps > 0 ? currentStepIndex / totalSteps : 0;

  return (
    <Box flexDirection="column" width="100%">
      {/* Header */}
      <Box borderStyle="double" borderColor="cyan" paddingX={1}>
        <Box flexDirection="row" width="100%" justifyContent="space-between">
          <Text>
            <Text color="cyan">FlowWorker: </Text>
            <Text bold>{workerId}</Text>
            <Text color="gray"> │ </Text>
            <Text color="yellow">Task: </Text>
            <Text>{taskId || 'idle'}</Text>
            <Text color="gray"> │ </Text>
            <Text color="magenta" bold>{flowName || 'No flow'}</Text>
          </Text>
        </Box>
      </Box>

      {/* Flow DAG and Stats Row */}
      <Box borderStyle="single" borderColor="gray" paddingX={1} flexDirection="column" minHeight={4}>
        <Box flexDirection="row" width="100%" justifyContent="space-between">
          <Text>
            <Text color="cyan">Flow DAG: </Text>
            <Text color="gray">{taskId ? dagViz : 'No active flow'}</Text>
          </Text>
          <Text>
            <Text color="cyan">{formatDuration(elapsedSeconds)}</Text>
            <Text color="gray"> │ </Text>
            <Text color={retryCount > 0 ? 'yellow' : 'white'}>↻ {retryCount}</Text>
          </Text>
        </Box>

        <Box flexDirection="row" marginTop={1}>
          <Text>
            <Text color="yellow">Current Step: </Text>
            <Text bold>{currentStep?.name || 'None'}</Text>
            <Text color="gray"> ({currentStepIndex + 1}/{totalSteps}) </Text>
            <Text color="cyan">{progressBar(currentStepIndex + 1, totalSteps, 16)}</Text>
            <Text color="cyan"> {formatPercentage(currentStepIndex + 1, totalSteps)}</Text>
          </Text>
        </Box>
      </Box>

      {/* Logs Section */}
      <Box borderStyle="single" borderColor="cyan" flexDirection="column" paddingX={1} height={logAreaHeight}>
        <Text color="cyan" bold>LOGS</Text>
        <Box borderStyle="single" borderColor="gray" flexDirection="column" marginTop={1} paddingX={1}>
          {displayLogs.length === 0 ? (
            <Text color="gray">No logs yet...</Text>
          ) : (
            displayLogs.map((log, idx) => {
              const isStepLog = log.message.startsWith('  [');

              return (
                <Box key={idx} flexDirection="row" gap={1}>
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
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Box flexDirection="row" width="100%" justifyContent="space-between">
          <Text>
            <Text dimColor>{workspaceDir ? (workspaceDir.length > 20 ? '...' + workspaceDir.slice(-20) : workspaceDir) : 'No workspace'}</Text>
          </Text>
          <Text>
            <Text color={connected ? 'green' : 'red'}>{connected ? 'Connected' : 'Disconnected'}</Text>
            <Text color="gray"> │ </Text>
            <Text>Out: {outputCount}</Text>
            <Text color="gray"> │ </Text>
            <Text>Err: {errorCount}</Text>
          </Text>
        </Box>
      </Box>

      {/* Footer hint */}
      <Box paddingX={1}>
        <Text color="gray" dimColor>
          View: [{getViewNumber(currentView)}] {getViewName(currentView)} | Press 1-5 to switch, P to {paused ? 'resume' : 'pause'}, Q to quit
          {paused && <Text color="yellow" bold> [PAUSED]</Text>}
        </Text>
      </Box>
    </Box>
  );
}
