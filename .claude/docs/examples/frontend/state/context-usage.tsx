// @ts-nocheck - Example code, not compiled
// Context Pattern
// Use when page manages state for >4-5 components
import * as React from 'react';

// Context is justified when:
// - Page has >4-5 components needing same state
// - Props drilling becomes unwieldy
// - State is truly shared across component tree

interface TaskContextValue {
	tasks: Task[];
	selectedTaskId: string | null;
	setSelectedTaskId: (id: string | null) => void;
	updateTask: (id: string, updates: Partial<Task>) => void;
}

const TaskContext = React.createContext<TaskContextValue | null>(null);

/**
 * Context Provider - scoped to feature
 * Lives in parent page component
 */
export function TaskProvider({ children }: { children: React.ReactNode }) {
	const [tasks, setTasks] = React.useState<Task[]>([]);
	const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);

	const updateTask = (id: string, updates: Partial<Task>) => {
		setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...updates } : t)));
	};

	const value: TaskContextValue = {
		tasks,
		selectedTaskId,
		setSelectedTaskId,
		updateTask,
	};

	return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

/**
 * Custom hook to access context
 * Enforces context is used within provider
 */
export function useTaskContext() {
	const context = React.useContext(TaskContext);
	if (!context) {
		throw new Error('useTaskContext must be used within TaskProvider');
	}
	return context;
}

// Usage in page
function TasksPage() {
	return (
		<TaskProvider>
			<TaskFilter />
			<TaskList />
			<TaskDetails />
			<TaskActions />
			<TaskStats />
			{/* 5+ components sharing state - context justified */}
		</TaskProvider>
	);
}
