import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import type { ScriptProcessWithConfig } from '@shared/api/workspaceScripts.contract';

interface ScriptSelectorProps {
	workspaceId: string;
	scripts: ScriptProcessWithConfig[];
	value: string | null;
	onChange: (scriptId: string | null) => void;
	disabled?: boolean;
}

/**
 * Dropdown to select which script to display in a panel
 * Shows script displayName with status indicator
 */
export function ScriptSelector({ scripts, value, onChange, disabled = false }: ScriptSelectorProps) {
	// If no scripts configured, show placeholder
	if (scripts.length === 0) {
		return (
			<div
				className={`
     flex-1 rounded border border-dashed border-border bg-muted/20 px-3 py-2
     text-sm text-muted-foreground
   `}
			>
				No scripts configured
			</div>
		);
	}

	return (
		<Select
			value={value || 'empty'}
			onValueChange={val => onChange(val === 'empty' ? null : val)}
			disabled={disabled}
		>
			<SelectTrigger className="flex-1">
				<SelectValue placeholder="Select a script" />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="empty">
					<span className="text-muted-foreground">Select a script...</span>
				</SelectItem>
				{scripts.map(({ script }) => {
					const displayName = script.displayName || script.scriptName;
					return (
						<SelectItem key={script.id} value={script.id}>
							<span>{displayName}</span>
						</SelectItem>
					);
				})}
			</SelectContent>
		</Select>
	);
}
