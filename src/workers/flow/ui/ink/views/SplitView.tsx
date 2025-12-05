// Design 1: Split View (Classic)

import React from 'react';
import { Box, Text } from 'ink';
import type { ViewProps } from '../../shared/types.js';
import { formatDuration, formatTime, formatStepDuration, getStepStatusIcon, getLogEmoji, getLogLevelColor, COLORS, getViewNumber, getViewName, truncate } from '../../shared/formatters.js';

export function SplitView({ state, currentView, terminalHeight }: ViewProps): React.ReactElement {
  const { workerId, taskId, flowName, orchestratorUrl, connected, paused } = state;
  const { steps, logs, elapsedSeconds, retryCount, workspaceDir, currentStepIndex, totalSteps } = state;

  // Calculate fixed height for logs (subtract header=3 + task=1 + middle=10 + footer=1 + borders=3)
  const logAreaHeight = Math.max(12, terminalHeight - 18);

  // Get last N logs to fit in the panel
  const displayLogs = logs.slice(-Math.max(8, logAreaHeight - 3));

  return (
    <Box flexDirection="column" width="100%">
      {/* Header */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Box flexDirection="row" width="100%" justifyContent="space-between">
          <Text>
            <Text color="cyan">FlowWorker: </Text>
            <Text bold>{workerId}</Text>
          </Text>
          <Text>
            <Text>Connected: </Text>
            <Text color={connected ? 'green' : 'red'}>{orchestratorUrl}</Text>
          </Text>
        </Box>
      </Box>

      <Box paddingX={1}>
        <Text>
          <Text color="yellow">Task: </Text>
          <Text>{taskId || 'idle'}</Text>
          <Text color="gray"> | </Text>
          <Text color="magenta">Flow: </Text>
          <Text bold>{flowName || 'None'}</Text>
        </Text>
      </Box>

      {/* Middle Section: Flow Progress + Statistics */}
      <Box flexDirection="row" minHeight={8}>
        {/* Left: Flow Progress */}
        <Box borderStyle="single" borderColor="gray" width="60%" flexDirection="column" paddingX={1}>
          <Text color="cyan" bold>─── Flow Progress ───</Text>
          <Box flexDirection="column" marginTop={1}>
            {steps.length === 0 ? (
              <Text color="gray">No active flow</Text>
            ) : (
              <>
                {steps.slice(0, 6).map((step, idx) => (
                  <Box key={step.id} flexDirection="row" gap={1}>
                    <Text color={step.status === 'completed' ? 'green' : step.status === 'failed' ? 'red' : step.status === 'running' ? 'yellow' : 'gray'}>
                      {getStepStatusIcon(step.status)}
                    </Text>
                    <Text color={step.status === 'running' ? 'yellow' : 'white'}>
                      {truncate(step.name, 25)}
                    </Text>
                    <Text color="gray">
                      [{step.status === 'completed' ? 'DONE' : step.status === 'running' ? 'RUN' : step.status === 'failed' ? 'FAIL' : 'PEND'}]
                    </Text>
                    <Text color="cyan">
                      {step.durationMs ? formatStepDuration(step.durationMs) : step.status === 'running' ? '...' : ''}
                    </Text>
                    {step.retryNumber !== undefined && step.retryNumber > 0 && (
                      <Text color="yellow">(#{step.retryNumber})</Text>
                    )}
                  </Box>
                ))}
                {steps.length > 6 && (
                  <Text color="gray" dimColor>...{steps.length - 6} more steps</Text>
                )}
              </>
            )}
          </Box>
        </Box>

        {/* Right: Statistics */}
        <Box borderStyle="single" borderColor="gray" width="40%" flexDirection="column" paddingX={1}>
          <Text color="cyan" bold>─── Statistics ───</Text>
          <Box flexDirection="column" marginTop={1}>
            <Text>
              <Text color="gray">Steps:          </Text>
              <Text>{currentStepIndex + 1}/{totalSteps}</Text>
            </Text>
            <Text>
              <Text color="gray">Duration:       </Text>
              <Text>{formatDuration(elapsedSeconds)}</Text>
            </Text>
            <Text>
              <Text color="gray">Retries:        </Text>
              <Text color={retryCount > 0 ? 'yellow' : 'white'}>{retryCount}</Text>
            </Text>
            {workspaceDir && (
              <Text>
                <Text color="gray">Workspace:      </Text>
                <Text dimColor>{workspaceDir.length > 25 ? '...' + workspaceDir.slice(-25) : workspaceDir}</Text>
              </Text>
            )}
          </Box>
        </Box>
      </Box>

      {/* Bottom: Execution Logs */}
      <Box borderStyle="single" borderColor="cyan" flexDirection="column" paddingX={1} height={logAreaHeight}>
        <Text color="cyan" bold>─── Execution Logs ───</Text>
        <Box flexDirection="column" marginTop={1}>
          {displayLogs.length === 0 ? (
            <Text color="gray">No logs yet...</Text>
          ) : (
            displayLogs.map((log, idx) => {
              const isStepLog = log.message.startsWith('  [');

              return (
                <Box key={idx} flexDirection="row" gap={1}>
                  <Text color="gray">[{formatTime(log.timestamp)}]</Text>
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
