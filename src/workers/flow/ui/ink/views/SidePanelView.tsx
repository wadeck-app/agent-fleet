// Design 5: Side Panel (Modern Split)

import React from 'react';
import { Box, Text } from 'ink';
import type { ViewProps } from '../../shared/types.js';
import { formatDuration, formatTime, formatStepDuration, getStepStatusIcon, progressBar, formatPercentage, truncate, getViewNumber, getViewName, getLogEmoji, getLogLevelColor } from '../../shared/formatters.js';

export function SidePanelView({ state, currentView, terminalHeight }: ViewProps): React.ReactElement {
  const { workerId, taskId, flowName, connected, paused } = state;
  const { steps, logs, elapsedSeconds, retryCount, workspaceDir, currentStepIndex, totalSteps, outputCount, errorCount } = state;

  // Calculate fixed height for logs
  const logAreaHeight = Math.max(20, terminalHeight - 5);

  // Get last N logs
  const displayLogs = logs.slice(-Math.max(12, logAreaHeight - 3));

  const currentStep = steps[currentStepIndex];
  const completedSteps = steps.filter(s => s.status === 'completed').length;

  // ETA calculation (rough estimate)
  const avgStepTime = steps
    .filter(s => s.durationMs)
    .reduce((sum, s) => sum + (s.durationMs || 0), 0) / Math.max(1, completedSteps);
  const remainingSteps = totalSteps - completedSteps;
  const etaSeconds = Math.floor((avgStepTime * remainingSteps) / 1000);

  return (
    <Box flexDirection="row" width="100%">
      {/* Left Side Panel */}
      <Box width={35} borderStyle="single" borderColor="cyan" flexDirection="column" paddingX={1}>
        <Text color="cyan" bold>{workerId}</Text>
        <Text color={connected ? 'green' : 'red'}>{connected ? 'Connected ●' : 'Disconnected ○'}</Text>
        <Box borderStyle="single" borderColor="gray" marginTop={1} />

        {/* Current Task */}
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow" bold>» Current Task</Text>
          <Text>
            <Text color="gray">ID:   </Text>
            <Text>{taskId || 'None'}</Text>
          </Text>
          <Text>
            <Text color="gray">Flow: </Text>
            <Text>{truncate(flowName || 'None', 20)}</Text>
          </Text>
          <Text>
            <Text color="gray">Step: </Text>
            <Text>{currentStepIndex + 1}/{totalSteps}</Text>
          </Text>
        </Box>

        {/* Progress */}
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow" bold>» Progress</Text>
          <Text color="cyan">
            {progressBar(completedSteps, totalSteps, 20)}
          </Text>
          <Text color="cyan">
            {formatPercentage(completedSteps, totalSteps)}
          </Text>
          {taskId && etaSeconds > 0 && (
            <Text>
              <Text color="gray">ETA: </Text>
              <Text>~{formatDuration(etaSeconds)}</Text>
            </Text>
          )}
        </Box>

        {/* Duration */}
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow" bold>» Duration</Text>
          <Text color="cyan" bold>{formatDuration(elapsedSeconds)}</Text>
        </Box>

        {/* Retries */}
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow" bold>» Retries: </Text>
          <Text color={retryCount > 0 ? 'yellow' : 'white'}>{retryCount}</Text>
        </Box>

        {/* Workspace */}
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow" bold>» Workspace</Text>
          <Text dimColor wrap="truncate-end">
            {workspaceDir ? truncate(workspaceDir, 28) : 'None'}
          </Text>
        </Box>

        {/* Steps List */}
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow" bold>» Steps</Text>
          {steps.length === 0 ? (
            <Text color="gray">No steps</Text>
          ) : (
            steps.map((step) => (
              <Box key={step.id} flexDirection="row" gap={1}>
                <Text color={
                  step.status === 'completed' ? 'green' :
                  step.status === 'failed' ? 'red' :
                  step.status === 'running' ? 'yellow' : 'gray'
                }>
                  {getStepStatusIcon(step.status)}
                </Text>
                <Text color={step.status === 'running' ? 'yellow' : 'white'}>
                  {truncate(step.name, 15)}
                </Text>
                <Text color="cyan" dimColor>
                  {formatStepDuration(step.durationMs)}
                  {step.status === 'running' && '...'}
                </Text>
              </Box>
            ))
          )}
        </Box>

        {/* Output/Error Count */}
        <Box flexDirection="column" marginTop={1}>
          <Text>
            <Text color="yellow" bold>» Outputs: </Text>
            <Text>{outputCount}</Text>
          </Text>
          <Text>
            <Text color="yellow" bold>» Errors: </Text>
            <Text color={errorCount > 0 ? 'red' : 'white'}>{errorCount}</Text>
          </Text>
        </Box>
      </Box>

      {/* Right Main Panel - Logs */}
      <Box flexDirection="column" flexGrow={1}>
        <Box borderStyle="single" borderColor="cyan" paddingX={1}>
          <Text color="cyan" bold>Execution Log</Text>
        </Box>

        <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1} height={logAreaHeight}>
          {displayLogs.length === 0 ? (
            <Box justifyContent="center" marginTop={5}>
              <Text color="gray">No logs yet...</Text>
            </Box>
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

        {/* Footer hint */}
        <Box paddingX={1}>
          <Text color="gray" dimColor>
            View: [{getViewNumber(currentView)}] {getViewName(currentView)} | Press 1-5 to switch, P to {paused ? 'resume' : 'pause'}, Q to quit
            {paused && <Text color="yellow" bold> [PAUSED]</Text>}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
