import { Tabs, TabsList, TabsTrigger } from '@framework/components/primitives/tabs';

const LAYOUTS = [
	{ key: 'a', label: 'Jira' },
	{ key: 'b', label: 'GitHub' },
	{ key: 'c', label: 'YouTrack' },
	{ key: 'd', label: 'Linear' },
	{ key: 'e', label: 'GitLab' },
	{ key: 'f', label: 'AI Mode' },
	{ key: 'g', label: 'Hybrid' },
] as const;

export type LayoutKey = (typeof LAYOUTS)[number]['key'];
const STORAGE_KEY = 'ticketDetailLayout';

export function LayoutSwitcher({ current, onChange }: { current: LayoutKey; onChange: (key: LayoutKey) => void }) {
	return (
		<Tabs
			value={current}
			onValueChange={value => {
				localStorage.setItem(STORAGE_KEY, value);
				onChange(value as LayoutKey);
			}}
		>
			<TabsList>
				{LAYOUTS.map(({ key, label }) => (
					<TabsTrigger key={key} value={key} title={label}>
						{key.toUpperCase()}
					</TabsTrigger>
				))}
			</TabsList>
		</Tabs>
	);
}

export function getStoredLayout(): LayoutKey {
	return (localStorage.getItem(STORAGE_KEY) as LayoutKey) || 'd';
}
