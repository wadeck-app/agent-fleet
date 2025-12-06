import React, { useState } from 'react';
import { Priority, WorkerType } from '../../types';
import { mockWorkflows } from '../../data/mockData';
import './TaskForm.css';

interface TaskFormProps {
  onSubmit: (taskData: {
    description: string;
    priority: Priority;
    flowId?: string;
    workspacePath?: string;
  }) => void;
  onCancel?: () => void;
}

export const TaskForm: React.FC<TaskFormProps> = ({ onSubmit, onCancel }) => {
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [flowId, setFlowId] = useState('');
  const [workspacePath, setWorkspacePath] = useState('');
  const [useFlow, setUseFlow] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!description.trim()) {
      alert('Please enter a task description');
      return;
    }

    onSubmit({
      description: description.trim(),
      priority,
      flowId: useFlow && flowId ? flowId : undefined,
      workspacePath: workspacePath || undefined
    });

    // Reset form
    setDescription('');
    setPriority('medium');
    setFlowId('');
    setWorkspacePath('');
    setUseFlow(true);
  };

  return (
    <div className="task-form">
      <div className="task-form-header">
        <h2>Add New Task</h2>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="description">Task Description *</label>
          <textarea
            id="description"
            className="form-input"
            rows={3}
            placeholder="Describe the task in detail..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="priority">Priority *</label>
          <select
            id="priority"
            className="form-select"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        <div className="form-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={useFlow}
              onChange={(e) => setUseFlow(e.target.checked)}
            />
            <span>Use workflow</span>
          </label>
        </div>

        {useFlow && (
          <div className="form-group">
            <label htmlFor="flowId">Workflow</label>
            <select
              id="flowId"
              className="form-select"
              value={flowId}
              onChange={(e) => setFlowId(e.target.value)}
            >
              <option value="">Select a workflow...</option>
              {mockWorkflows.map(workflow => (
                <option key={workflow.id} value={workflow.id}>
                  {workflow.name}
                </option>
              ))}
            </select>
            {flowId && (
              <div className="workflow-description">
                {mockWorkflows.find(w => w.id === flowId)?.description}
              </div>
            )}
          </div>
        )}

        <div className="form-group">
          <label htmlFor="workspacePath">Workspace Path (Optional)</label>
          <input
            id="workspacePath"
            type="text"
            className="form-input"
            placeholder="/path/to/workspace"
            value={workspacePath}
            onChange={(e) => setWorkspacePath(e.target.value)}
          />
          <div className="form-hint">
            Leave empty for automatic workspace allocation
          </div>
        </div>

        <div className="form-actions">
          {onCancel && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
          <button type="submit" className="btn btn-primary">
            Create Task
          </button>
        </div>
      </form>

      <div className="quick-actions">
        <div className="quick-actions-header">Quick Actions</div>
        <div className="quick-actions-grid">
          <button
            className="quick-action-btn"
            onClick={() => {
              setDescription('Run integration tests');
              setFlowId('testing-flow');
              setPriority('high');
              setUseFlow(true);
            }}
          >
            <span className="quick-action-icon">🧪</span>
            <span>Run Tests</span>
          </button>
          <button
            className="quick-action-btn"
            onClick={() => {
              setDescription('Deploy to production');
              setFlowId('deployment-flow');
              setPriority('urgent');
              setUseFlow(true);
            }}
          >
            <span className="quick-action-icon">🚀</span>
            <span>Deploy</span>
          </button>
          <button
            className="quick-action-btn"
            onClick={() => {
              setDescription('Code review required');
              setFlowId('code-review-flow');
              setPriority('medium');
              setUseFlow(true);
            }}
          >
            <span className="quick-action-icon">👀</span>
            <span>Code Review</span>
          </button>
          <button
            className="quick-action-btn"
            onClick={() => {
              setDescription('Apply hotfix');
              setFlowId('hotfix-flow');
              setPriority('urgent');
              setUseFlow(true);
            }}
          >
            <span className="quick-action-icon">🔥</span>
            <span>Hotfix</span>
          </button>
        </div>
      </div>
    </div>
  );
};
