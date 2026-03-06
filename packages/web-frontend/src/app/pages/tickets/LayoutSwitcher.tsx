import { Button } from '@framework/components/primitives/Button';
import { cn } from '@framework/lib/utils';

const LAYOUTS = [
	{ key: 'a', label: 'Jira' },
	{ key: 'b', label: 'GitHub' },
	{ key: 'c', label: 'YouTrack' },
	{ key: 'd', label: 'Linear' },
	{ key: 'e', label: 'GitLab' },
	{ key: 'f', label: 'AI Mode' },
] as const;

export type LayoutKey = (typeof LAYOUTS)[number]['key'];
const STORAGE_KEY = 'ticketDetailLayout';

export function LayoutSwitcher({ current, onChange }: { current: LayoutKey; onChange: (key: LayoutKey) => void }) {
	return (
		<div className="flex gap-1 rounded-md border bg-muted p-1">
			{LAYOUTS.map(({ key, label }) => (
				<Button
					key={key}
					variant="ghost"
					title={label}
					onClick={() => {
						localStorage.setItem(STORAGE_KEY, key);
						onChange(key);
					}}
					className={cn(
						'h-auto rounded px-2 py-1 text-xs font-medium transition-colors',
						current === key
							? 'bg-background text-foreground shadow-sm'
							: 'text-muted-foreground hover:text-foreground'
					)}
				>
					{key.toUpperCase()}
				</Button>
			))}
		</div>
	);
}

export function getStoredLayout(): LayoutKey {
	return (localStorage.getItem(STORAGE_KEY) as LayoutKey) || 'd';
}
