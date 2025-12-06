import { useState } from 'react';
import { Modal } from '../Modal/Modal';
import { Button } from '../Button/Button';
import './TaskModal.css';

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
        <>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit}>
            Create Task
          </Button>
        </>
      }
    >
      <div className="task-modal-content">
        <div className="task-modal-field">
          <label className="task-modal-label">Task Name</label>
          <input
            type="text"
            className="task-modal-input"
            placeholder="Enter task name..."
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="task-modal-field">
          <label className="task-modal-label">Task Type</label>
          <div className="task-modal-type-selector">
            <button
              className={`task-modal-type-button ${taskType === 'flow' ? 'active' : ''}`}
              onClick={() => handleTypeChange('flow')}
            >
              Flow (YAML)
            </button>
            <button
              className={`task-modal-type-button ${taskType === 'command' ? 'active' : ''}`}
              onClick={() => handleTypeChange('command')}
            >
              Command
            </button>
          </div>
        </div>

        <div className="task-modal-field">
          <label className="task-modal-label">Configuration</label>
          <textarea
            className="task-modal-editor"
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            placeholder="Enter YAML or command configuration..."
            spellCheck={false}
          />
        </div>

        <div className="task-modal-help">
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
        </div>
      </div>
    </Modal>
  );
}
