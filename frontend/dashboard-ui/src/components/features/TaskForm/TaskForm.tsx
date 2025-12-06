import React, { useState } from 'react';
import { Priority } from '@/types';
import { Button } from '@/components/ui/Button/Button';
import { Card } from '@/components/ui/Card/Card';
import styles from './TaskForm.module.scss';

interface TaskFormProps {
  onSubmit: (taskData: {
    description: string;
    priority: Priority;
    flowId?: string;
    workspacePath?: string;
  }) => void;
  onCancel?: () => void;
  workflows?: Array<{ id: string; name: string; description: string }>;
}

export function TaskForm({ onSubmit, onCancel, workflows = [] }: TaskFormProps) {
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

  const handleQuickAction = (desc: string, flow: string, prio: Priority) => {
    setDescription(desc);
    setFlowId(flow);
    setPriority(prio);
    setUseFlow(true);
  };

  return (
    <Card className={styles.taskForm}>
      <div className={styles.header}>
        <h2 className={styles.title}>Add New Task</h2>
      </div>

      <form onSubmit={handleSubmit}>
        <div className={styles.formGroup}>
          <label htmlFor="description" className={styles.label}>
            Task Description *
          </label>
          <textarea
            id="description"
            className={styles.textarea}
            rows={3}
            placeholder="Describe the task in detail..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="priority" className={styles.label}>
            Priority *
          </label>
          <select
            id="priority"
            className={styles.select}
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={useFlow}
              onChange={(e) => setUseFlow(e.target.checked)}
            />
            <span>Use workflow</span>
          </label>
        </div>

        {useFlow && workflows.length > 0 && (
          <div className={styles.formGroup}>
            <label htmlFor="flowId" className={styles.label}>
              Workflow
            </label>
            <select
              id="flowId"
              className={styles.select}
              value={flowId}
              onChange={(e) => setFlowId(e.target.value)}
            >
              <option value="">Select a workflow...</option>
              {workflows.map(workflow => (
                <option key={workflow.id} value={workflow.id}>
                  {workflow.name}
                </option>
              ))}
            </select>
            {flowId && (
              <div className={styles.workflowDescription}>
                {workflows.find(w => w.id === flowId)?.description}
              </div>
            )}
          </div>
        )}

        <div className={styles.formGroup}>
          <label htmlFor="workspacePath" className={styles.label}>
            Workspace Path (Optional)
          </label>
          <input
            id="workspacePath"
            type="text"
            className={styles.input}
            placeholder="/path/to/workspace"
            value={workspacePath}
            onChange={(e) => setWorkspacePath(e.target.value)}
          />
          <div className={styles.formHint}>
            Leave empty for automatic workspace allocation
          </div>
        </div>

        <div className={styles.formActions}>
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" variant="primary">
            Create Task
          </Button>
        </div>
      </form>

      <div className={styles.quickActions}>
        <div className={styles.quickActionsHeader}>Quick Actions</div>
        <div className={styles.quickActionsGrid}>
          <button
            type="button"
            className={styles.quickActionBtn}
            onClick={() => handleQuickAction('Run integration tests', 'testing-flow', 'high')}
          >
            <span className={styles.quickActionIcon}>🧪</span>
            <span>Run Tests</span>
          </button>
          <button
            type="button"
            className={styles.quickActionBtn}
            onClick={() => handleQuickAction('Deploy to production', 'deployment-flow', 'urgent')}
          >
            <span className={styles.quickActionIcon}>🚀</span>
            <span>Deploy</span>
          </button>
          <button
            type="button"
            className={styles.quickActionBtn}
            onClick={() => handleQuickAction('Code review required', 'code-review-flow', 'medium')}
          >
            <span className={styles.quickActionIcon}>👀</span>
            <span>Code Review</span>
          </button>
          <button
            type="button"
            className={styles.quickActionBtn}
            onClick={() => handleQuickAction('Apply hotfix', 'hotfix-flow', 'urgent')}
          >
            <span className={styles.quickActionIcon}>🔥</span>
            <span>Hotfix</span>
          </button>
        </div>
      </div>
    </Card>
  );
}
