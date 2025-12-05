// Design 3: Timeline View (Visual Flow)

import React from 'react';
import { Box, Text } from 'ink';
import type { ViewProps } from '../../shared/types.js';
import { formatDuration, formatTime, formatStepDuration, getLogEmoji, getLogLevelColor, truncate, getViewNumber, getViewName } from '../../shared/formatters.js';

export function TimelineView({ state, currentView, terminalHeight }: ViewProps): React.ReactElement {
  const { workerId, taskId, flowName, connected, paused } = state;
  const { steps, logs, elapsedSeconds, retryCount, workspaceDir } = state;

  // Calculate fixed heights
  const timelineHeight = Math.min(14, Math.floor(terminalHeight * 0.35));
  const logAreaHeight = Math.max(10, terminalHeight - timelineHeight - 6);

  // Get last N logs
  const displayLogs = logs.slice(-Math.max(6, logAreaHeight - 3));

  // Build timeline visualization
  const maxTimeSeconds = Math.max(...steps.map(s => (s.durationMs || 0) / 1000), 1);
  const timelineWidth = 60;

  return (
    <Box flexDirection="column" width="100%">
      {/* Header */}
      <Box borderStyle="double" borderColor="cyan" paddingX={1}>
        <Box flexDirection="row" width="100%" justifyContent="space-between">
          <Text>
            <Text color="cyan" bold>FlowWorker: {workerId || '?'}</Text>
            <Text color="gray"> │ </Text>
            <Text color="magenta">{flowName || 'No flow'}</Text>
            <Text color="gray"> │ </Text>
            <Text color="yellow">Task {taskId || 'idle'}</Text>
          </Text>
        </Box>
      </Box>

      {/* Timeline Section */}
      <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1} minHeight={timelineHeight}>
        <Text color="cyan" bold>─ Timeline ─</Text>

        {taskId ? (
          <>
            {/* Time markers */}
            <Box marginTop={1}>
              <Text color="gray">
                0s      3s      6s      9s      12s     15s     18s     21s     24s
              </Text>
            </Box>
            <Box>
              <Text color="gray">
                ├───────┼───────┼───────┼───────┼───────┼───────┼───────┼───────┤
              </Text>
            </Box>

            {/* Step timeline bars */}
            <Box flexDirection="column" marginTop={1}>
              {steps.map((step, idx) => {
                const duration = (step.durationMs || 0) / 1000;
                const barLength = Math.max(1, Math.floor((duration / 24) * 60));
                let bar = '';

                if (step.status === 'completed') {
                  bar = '▓'.repeat(barLength);
                } else if (step.status === 'failed') {
                  bar = '▓'.repeat(Math.floor(barLength / 2)) + '✗';
                } else if (step.status === 'running') {
                  bar = '▓'.repeat(Math.floor(barLength * 0.7)) + '▶';
                } else {
                  bar = '░'.repeat(barLength);
                }

                const statusText = step.status === 'completed' ? '✓' :
                                  step.status === 'failed' ? '✗' :
                                  step.status === 'running' ? '▶' : '';

                return (
                  <Box key={step.id} flexDirection="column">
                    <Box>
                      <Text color={
                        step.status === 'completed' ? 'green' :
                        step.status === 'failed' ? 'red' :
                        step.status === 'running' ? 'yellow' : 'gray'
                      }>
                        {bar}
                      </Text>
                    </Box>
                    <Text color={step.status === 'completed' ? 'green' : step.status === 'failed' ? 'red' : 'gray'}>
                      {truncate(step.name, 20)} ({statusText}) {formatStepDuration(step.durationMs)}
                      {step.retryNumber !== undefined && step.retryNumber > 0 && ` [retry #${step.retryNumber}]`}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          </>
        ) : (
          <Box marginTop={3} justifyContent="center">
            <Text color="gray">No active flow</Text>
          </Box>
        )}
      </Box>

      {/* Live Output */}
      <Box borderStyle="single" borderColor="cyan" flexDirection="column" paddingX={1} height={logAreaHeight}>
        <Text color="cyan" bold>─ Live Output ─</Text>
        <Box flexDirection="column" marginTop={1}>
          {displayLogs.length === 0 ? (
            <Text color="gray">No output yet...</Text>
          ) : (
            displayLogs.map((log, idx) => {
              const isStepLog = log.message.startsWith('  [');

              return (
                <Box key={idx} flexDirection="row" gap={1}>
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

      {/* Footer Stats */}
      <Box paddingX={1}>
        <Text>
          <Text color="gray">Stats: </Text>
          <Text>{steps.filter(s => s.status === 'completed').length}/{steps.length} steps</Text>
          <Text color="gray"> │ </Text>
          <Text>{formatDuration(elapsedSeconds)} elapsed</Text>
          <Text color="gray"> │ </Text>
          <Text>{retryCount} retry</Text>
          <Text color="gray"> │ </Text>
          <Text dimColor>{workspaceDir ? truncate(workspaceDir, 30) : 'No workspace'}</Text>
          <Text color="gray"> │ </Text>
          <Text color={connected ? 'green' : 'red'}>Connected {connected ? '✓' : '✗'}</Text>
        </Text>
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
