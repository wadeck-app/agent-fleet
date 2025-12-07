import { useState } from 'react';
import * as Select from '@radix-ui/react-select';
import * as Checkbox from '@radix-ui/react-checkbox';
import { ChevronDownIcon, CheckIcon } from '@radix-ui/react-icons';
import { Priority } from '@/types';
import { Button } from '@/components/ui/Button/Button';
import { Card } from '@/components/ui/Card/Card';
import { Input } from '@/components/ui/Input/Input';
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
          <label className={styles.label}>
            Priority *
          </label>
          <Select.Root value={priority} onValueChange={(value) => setPriority(value as Priority)}>
            <Select.Trigger className={styles.selectTrigger}>
              <Select.Value />
              <Select.Icon className={styles.selectIcon}>
                <ChevronDownIcon />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content className={styles.selectContent}>
                <Select.Viewport className={styles.selectViewport}>
                  <Select.Item value="low" className={styles.selectItem}>
                    <Select.ItemText>Low</Select.ItemText>
                    <Select.ItemIndicator className={styles.selectItemIndicator}>
                      <CheckIcon />
                    </Select.ItemIndicator>
                  </Select.Item>
                  <Select.Item value="medium" className={styles.selectItem}>
                    <Select.ItemText>Medium</Select.ItemText>
                    <Select.ItemIndicator className={styles.selectItemIndicator}>
                      <CheckIcon />
                    </Select.ItemIndicator>
                  </Select.Item>
                  <Select.Item value="high" className={styles.selectItem}>
                    <Select.ItemText>High</Select.ItemText>
                    <Select.ItemIndicator className={styles.selectItemIndicator}>
                      <CheckIcon />
                    </Select.ItemIndicator>
                  </Select.Item>
                  <Select.Item value="urgent" className={styles.selectItem}>
                    <Select.ItemText>Urgent</Select.ItemText>
                    <Select.ItemIndicator className={styles.selectItemIndicator}>
                      <CheckIcon />
                    </Select.ItemIndicator>
                  </Select.Item>
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.checkboxLabel}>
            <Checkbox.Root
              className={styles.checkbox}
              checked={useFlow}
              onCheckedChange={(checked) => setUseFlow(checked === true)}
            >
              <Checkbox.Indicator className={styles.checkboxIndicator}>
                <CheckIcon />
              </Checkbox.Indicator>
            </Checkbox.Root>
            <span>Use workflow</span>
          </label>
        </div>

        {useFlow && workflows.length > 0 && (
          <div className={styles.formGroup}>
            <label className={styles.label}>
              Workflow
            </label>
            <Select.Root value={flowId || undefined} onValueChange={setFlowId}>
              <Select.Trigger className={styles.selectTrigger}>
                <Select.Value placeholder="Select a workflow..." />
                <Select.Icon className={styles.selectIcon}>
                  <ChevronDownIcon />
                </Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className={styles.selectContent}>
                  <Select.Viewport className={styles.selectViewport}>
                    {workflows.map(workflow => (
                      <Select.Item key={workflow.id} value={workflow.id} className={styles.selectItem}>
                        <Select.ItemText>{workflow.name}</Select.ItemText>
                        <Select.ItemIndicator className={styles.selectItemIndicator}>
                          <CheckIcon />
                        </Select.ItemIndicator>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
            {flowId && (
              <div className={styles.workflowDescription}>
                {workflows.find(w => w.id === flowId)?.description}
              </div>
            )}
          </div>
        )}

        <div className={styles.formGroup}>
          <Input
            label="Workspace Path (Optional)"
            type="text"
            placeholder="/path/to/workspace"
            value={workspacePath}
            onChange={(e) => setWorkspacePath(e.target.value)}
            fullWidth
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
