import { TabButton } from '@framework/components/primitives/TabButton';
import { TabGroup } from '@framework/components/primitives/TabGroup';

interface WorkspaceViewTabsProps {
	activeView: 'tasks' | 'scripts' | 'files';
	onViewChange: (view: 'tasks' | 'scripts' | 'files') => void;
}

export function WorkspaceViewTabs({ activeView, onViewChange }: WorkspaceViewTabsProps) {
	return (
		<TabGroup variant="card">
			<TabButton active={activeView === 'tasks'} onClick={() => onViewChange('tasks')}>
				Tasks
			</TabButton>
			<TabButton active={activeView === 'scripts'} onClick={() => onViewChange('scripts')}>
				Scripts
			</TabButton>
			<TabButton active={activeView === 'files'} onClick={() => onViewChange('files')}>
				Files
			</TabButton>
		</TabGroup>
	);
}
