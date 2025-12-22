// @ts-nocheck - Example code, not compiled
// Props-Based Communication Pattern
// Components communicate ONLY through props, never directly
import * as React from 'react';

// ❌ BAD - Components communicating directly
class BadExample {
	// Child1 calling Child2's method directly
	handleClick() {
		this.child2Ref.current.doSomething();
	}
}

// ✅ GOOD - Communication through parent via props
interface TaskFilterProps {
	selectedStatus: string;
	onStatusChange: (status: string) => void;
}

function TaskFilter({ selectedStatus, onStatusChange }: TaskFilterProps) {
	return (
		<select value={selectedStatus} onChange={e => onStatusChange(e.target.value)}>
			<option value="all">All</option>
			<option value="todo">To Do</option>
			<option value="done">Done</option>
		</select>
	);
}

interface TaskListProps {
	tasks: Task[];
	filter: string;
}

function TaskList({ tasks, filter }: TaskListProps) {
	const filteredTasks = tasks.filter(t => filter === 'all' || t.status === filter);

	return (
		<div>
			{filteredTasks.map(task => (
				<TaskCard key={task.id} task={task} />
			))}
		</div>
	);
}

// Parent manages shared state
function TasksPage() {
	const [tasks, setTasks] = React.useState([]);
	const [filter, setFilter] = React.useState('all');

	return (
		<>
			<TaskFilter selectedStatus={filter} onStatusChange={setFilter} />
			<TaskList tasks={tasks} filter={filter} />
		</>
	);
}
