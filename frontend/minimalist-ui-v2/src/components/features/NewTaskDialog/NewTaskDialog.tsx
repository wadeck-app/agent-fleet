/**
 * NewTaskDialog - Feature component for creating new tasks
 * Composes generic UI components with task creation logic
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog/Dialog';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select/Select';
import { FlowDefinition, TaskPriority } from '@/types/domain';

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Input
              label="Description"
              placeholder="What needs to be done?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              autoFocus
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium leading-none">Priority</label>
              <Select value={priority} onValueChange={(value) => setPriority(value as TaskPriority)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {flows.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium leading-none">Flow (optional)</label>
                <Select value={flowId || undefined} onValueChange={setFlowId}>
                  <SelectTrigger>
                    <SelectValue placeholder="No flow" />
                  </SelectTrigger>
                  <SelectContent>
                    {flows.map((flow) => (
                      <SelectItem key={flow.id} value={flow.id}>
                        {flow.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={!description.trim() || loading}>
                {loading ? 'Creating...' : 'Create Task'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
