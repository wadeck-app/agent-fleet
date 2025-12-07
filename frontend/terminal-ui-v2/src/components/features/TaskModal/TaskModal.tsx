/**
 * TaskModal - Feature component
 * Modal for creating new tasks (flow or command)
 * Updated with shadcn/ui and Framer Motion animations
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Modal } from '@/components/ui/Modal/Modal';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { Label } from '@/components/ui/Label/Label';
import styles from './TaskModal.module.scss';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, config: string, type: 'flow' | 'command') => void;
}

const FLOW_TEMPLATE = `name: my-flow
steps:
  - name: setup
    action: npm install
  - name: build
    action: npm run build
  - name: test
    action: npm test`;

const COMMAND_TEMPLATE = `command: echo "Hello World"`;

export function TaskModal({ isOpen, onClose, onSubmit }: TaskModalProps) {
  const [taskName, setTaskName] = useState('');
  const [taskType, setTaskType] = useState<'flow' | 'command'>('flow');
  const [config, setConfig] = useState(FLOW_TEMPLATE);

  const handleTypeChange = (type: 'flow' | 'command') => {
    setTaskType(type);
    setConfig(type === 'flow' ? FLOW_TEMPLATE : COMMAND_TEMPLATE);
  };

  const handleSubmit = () => {
    if (!taskName.trim() || !config.trim()) {
      alert('Please provide a task name and configuration');
      return;
    }
    onSubmit(taskName, config, taskType);
    setTaskName('');
    setConfig(taskType === 'flow' ? FLOW_TEMPLATE : COMMAND_TEMPLATE);
    onClose();
  };

  const handleClose = () => {
    setTaskName('');
    setConfig(taskType === 'flow' ? FLOW_TEMPLATE : COMMAND_TEMPLATE);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create New Task"
      size="lg"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit}>
            Create Task
          </Button>
        </div>
      }
    >
      <motion.div
        className={styles.taskModalContent}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          className={styles.taskModalField}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Input
            label="Task Name"
            type="text"
            placeholder="Enter task name..."
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            autoFocus
            fullWidth
          />
        </motion.div>

        <motion.div
          className={styles.taskModalField}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Label>Task Type</Label>
          <div className={styles.taskModalTypeSelector}>
            <motion.button
              className={`${styles.taskModalTypeButton} ${taskType === 'flow' ? styles.active : ''}`}
              onClick={() => handleTypeChange('flow')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Flow (YAML)
            </motion.button>
            <motion.button
              className={`${styles.taskModalTypeButton} ${taskType === 'command' ? styles.active : ''}`}
              onClick={() => handleTypeChange('command')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Command
            </motion.button>
          </div>
        </motion.div>

        <motion.div
          className={styles.taskModalField}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Label>Configuration</Label>
          <motion.textarea
            className={styles.taskModalEditor}
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            placeholder="Enter YAML or command configuration..."
            spellCheck={false}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          />
        </motion.div>

        <motion.div
          className={styles.taskModalHelp}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {taskType === 'flow' ? (
            <>
              <strong>Flow YAML format:</strong>
              <ul>
                <li>Define steps with name and action</li>
                <li>Steps run sequentially</li>
                <li>Use standard shell commands</li>
              </ul>
            </>
          ) : (
            <>
              <strong>Command format:</strong>
              <ul>
                <li>Single shell command to execute</li>
                <li>Can use pipes and redirects</li>
                <li>Runs in worker's environment</li>
              </ul>
            </>
          )}
        </motion.div>
      </motion.div>
    </Modal>
  );
}
