import React, { useState, useEffect } from 'react';
import { Box, Text, render } from 'ink';
import { Task, WorkerInfo, TaskStatus } from '../../../shared/types.js';
import { StateManager, StateEvent } from '../../../shared/StateManager.js';
import { TaskManager } from '../../core/TaskManager.js';
import { WorkerWebSocketServer } from '../../websocket/WorkerWebSocketServer.js';
import {Shutdownable} from "../../../shared/Shutdownable.js";

interface OrchestratorUIProps {
  taskManager: TaskManager;
  wsServer: WorkerWebSocketServer | null;
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  [TaskStatus.BACKLOG]: 'gray',
  [TaskStatus.REFINING]: 'cyan',
  [TaskStatus.REFINED]: 'cyan',
  [TaskStatus.PRIORITIZING]: 'cyan',
  [TaskStatus.TODO]: 'blue',
  [TaskStatus.IN_PROGRESS]: 'yellow',
  [TaskStatus.TESTING]: 'magenta',
  [TaskStatus.REVIEW]: 'magenta',
  [TaskStatus.REVIEWING]: 'magenta',
  [TaskStatus.CHANGES_REQUESTED]: 'yellow',
  [TaskStatus.APPROVED]: 'green',
  [TaskStatus.MERGED]: 'green',
  [TaskStatus.BLOCKED]: 'red',
  [TaskStatus.CANCELLED]: 'red'
};

const OrchestratorUI: React.FC<OrchestratorUIProps> = ({ taskManager, wsServer }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [logs, setLogs] = useState<string[]>([]);

  // Load initial data
  useEffect(() => {
    setTasks(taskManager.getAllTasks());
    setWorkers(wsServer.getWorkers());
  }, [taskManager, wsServer]);

  // Subscribe to state changes
  useEffect(() => {
    const stateManager = StateManager.getInstance();

    const handleTaskCreated = () => {
      setTasks(taskManager.getAllTasks());
    };

    const handleTaskUpdated = () => {
      setTasks(taskManager.getAllTasks());
    };

    const handleTaskDeleted = () => {
      setTasks(taskManager.getAllTasks());
    };

    const handleWorkerConnected = () => {
      setWorkers(wsServer.getWorkers());
    };

    const handleWorkerDisconnected = () => {
      setWorkers(wsServer.getWorkers());
    };

    const handleWorkerTaskAssigned = () => {
      setWorkers(wsServer.getWorkers());
    };

    const handleWorkerTaskReleased = () => {
      setWorkers(wsServer.getWorkers());
    };

    const handleLogMessage = (data: { message: string }) => {
      setLogs(prevLogs => {
        const newLogs = [...prevLogs, data.message];
        // Keep only last 8 logs
        return newLogs.slice(-8);
      });
    };

    stateManager.on(StateEvent.TASK_CREATED, handleTaskCreated);
    stateManager.on(StateEvent.TASK_UPDATED, handleTaskUpdated);
    stateManager.on(StateEvent.TASK_DELETED, handleTaskDeleted);
    stateManager.on(StateEvent.WORKER_CONNECTED, handleWorkerConnected);
    stateManager.on(StateEvent.WORKER_DISCONNECTED, handleWorkerDisconnected);
    stateManager.on(StateEvent.WORKER_TASK_ASSIGNED, handleWorkerTaskAssigned);
    stateManager.on(StateEvent.WORKER_TASK_RELEASED, handleWorkerTaskReleased);
    stateManager.on(StateEvent.LOG_MESSAGE, handleLogMessage);

    return () => {
      stateManager.off(StateEvent.TASK_CREATED, handleTaskCreated);
      stateManager.off(StateEvent.TASK_UPDATED, handleTaskUpdated);
      stateManager.off(StateEvent.TASK_DELETED, handleTaskDeleted);
      stateManager.off(StateEvent.WORKER_CONNECTED, handleWorkerConnected);
      stateManager.off(StateEvent.WORKER_DISCONNECTED, handleWorkerDisconnected);
      stateManager.off(StateEvent.WORKER_TASK_ASSIGNED, handleWorkerTaskAssigned);
      stateManager.off(StateEvent.WORKER_TASK_RELEASED, handleWorkerTaskReleased);
      stateManager.off(StateEvent.LOG_MESSAGE, handleLogMessage);
    };
  }, [taskManager, wsServer]);

  // Group tasks by status
  const tasksByStatus = tasks.reduce((acc, task) => {
    if (!acc[task.status]) {
      acc[task.status] = [];
    }
    acc[task.status].push(task);
    return acc;
  }, {} as Record<TaskStatus, Task[]>);

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Agent Fleet Orchestrator
        </Text>
      </Box>

      {/* Logs Box */}
      <Box flexDirection="column" marginBottom={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text bold dimColor>Logs (last 8 lines)</Text>
        {logs.length === 0 ? (
          <Text dimColor>No logs yet</Text>
        ) : (
          logs.map((log, index) => (
            <Text key={index} dimColor>{log}</Text>
          ))
        )}
      </Box>

      {/* Main content: Two columns */}
      <Box>
        {/* Left column: Tasks */}
        <Box flexDirection="column" width="60%" paddingRight={2} borderStyle="single" borderColor="gray">
          <Box marginBottom={1}>
            <Text bold underline>
              Tasks ({tasks.length})
            </Text>
          </Box>

          {tasks.length === 0 ? (
            <Text dimColor>No tasks</Text>
          ) : (
            Object.entries(tasksByStatus).map(([status, statusTasks]) => (
              <Box key={status} flexDirection="column" marginBottom={1}>
                <Text bold color={STATUS_COLORS[status as TaskStatus]}>
                  {status.toUpperCase()} ({statusTasks.length})
                </Text>
                {statusTasks.map((task) => (
                  <Box key={task.id} paddingLeft={2} flexDirection="column">
                    <Text>
                      <Text dimColor>[{task.id.substring(0, 8)}]</Text> {task.description.substring(0, 40)}
                      {task.description.length > 40 ? '...' : ''}
                      {task.assignedTo && (
                        <Text dimColor> [Worker {task.assignedTo.workerId}]</Text>
                      )}
                    </Text>
                    {/* Show flow info if it's a flow-based task */}
                    {task.flowId && (
                      <Box paddingLeft={2}>
                        <Text dimColor>
                          Flow: {task.flowId}
                          {task.flowResult && (
                            <Text color={task.flowResult.status === 'completed' ? 'green' : 'red'}>
                              {' '}[{task.flowResult.status}]
                            </Text>
                          )}
                        </Text>
                      </Box>
                    )}
                    {/* Show workspace info if allocated */}
                    {task.metadata?.workspacePath && (
                      <Box paddingLeft={2}>
                        <Text dimColor>
                          Workspace: {task.metadata.workspacePath.substring(task.metadata.workspacePath.lastIndexOf('/') + 1)}
                        </Text>
                      </Box>
                    )}
                    {/* Show recent comments (last one only) */}
                    {task.comments.length > 0 && (
                      <Box paddingLeft={2}>
                        <Text dimColor italic>
                          {task.comments[task.comments.length - 1].content.substring(0, 50)}
                          {task.comments[task.comments.length - 1].content.length > 50 ? '...' : ''}
                        </Text>
                      </Box>
                    )}
                  </Box>
                ))}
              </Box>
            ))
          )}
        </Box>

        {/* Right column: Workers */}
        <Box flexDirection="column" width="40%" paddingLeft={2}>
          <Box marginBottom={1}>
            <Text bold underline>
              Workers ({workers.length})
            </Text>
          </Box>

          {workers.length === 0 ? (
            <Text dimColor>No workers connected</Text>
          ) : (
            workers.map((worker) => {
              const currentTask = worker.taskId ? tasks.find(t => t.id === worker.taskId) : null;
              return (
                <Box key={worker.id} flexDirection="column" marginBottom={1}>
                  <Text>
                    <Text bold color="green">Worker {worker.id}</Text>
                    <Text dimColor> ({worker.type})</Text>
                  </Text>
                  <Box paddingLeft={2}>
                    {currentTask ? (
                      <>
                        <Text color="yellow">
                          ▶ {currentTask.description.substring(0, 35)}
                          {currentTask.description.length > 35 ? '...' : ''}
                        </Text>
                        <Text dimColor> [{currentTask.status}]</Text>
                      </>
                    ) : (
                      <Text dimColor>Idle</Text>
                    )}
                  </Box>
                </Box>
              );
            })
          )}
        </Box>
      </Box>
    </Box>
  );
};

export function renderUI(taskManager: TaskManager, shutdownable: Shutdownable, wsServer: WorkerWebSocketServer) {
  const instance = render(<OrchestratorUI taskManager={taskManager} wsServer={wsServer} />);
  // Add start() method for compatibility with terminal-kit UI
  return {
    ...instance,
    start: () => { /* Ink starts automatically */ }
  };
}
