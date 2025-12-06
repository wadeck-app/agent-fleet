/**
 * NewTaskDialog - Feature component for creating new tasks
 * Composes generic UI components with task creation logic
 */

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Cross2Icon } from '@radix-ui/react-icons';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { FlowDefinition, TaskPriority } from '@/types/domain';
import styles from './NewTaskDialog.module.scss';

export interface NewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    description: string;
    priority: TaskPriority;
    flowId?: string;
  }) => Promise<void>;
  flows?: FlowDefinition[];
}

export function NewTaskDialog({ open, onOpenChange, onSubmit, flows = [] }: NewTaskDialogProps) {
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [flowId, setFlowId] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!description.trim()) return;

    setLoading(true);
    try {
      await onSubmit({
        description: description.trim(),
        priority,
        flowId: flowId || undefined,
      });
      setDescription('');
      setPriority('medium');
      setFlowId('');
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to create task:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>New Task</Dialog.Title>
            <Dialog.Close asChild>
              <button className={styles.closeButton} aria-label="Close">
                <Cross2Icon />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            <Input
              label="Description"
              placeholder="What needs to be done?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              autoFocus
              required
            />

            <div className={styles.formRow}>
              <div className={styles.formField}>
                <label htmlFor="priority" className={styles.label}>
                  Priority
                </label>
                <select
                  id="priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className={styles.select}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              {flows.length > 0 && (
                <div className={styles.formField}>
                  <label htmlFor="flow" className={styles.label}>
                    Flow (optional)
                  </label>
                  <select
                    id="flow"
                    value={flowId}
                    onChange={(e) => setFlowId(e.target.value)}
                    className={styles.select}
                  >
                    <option value="">No flow</option>
                    {flows.map((flow) => (
                      <option key={flow.id} value={flow.id}>
                        {flow.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className={styles.actions}>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!description.trim() || loading}>
                {loading ? 'Creating...' : 'Create Task'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
