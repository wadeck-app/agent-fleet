import { useState } from 'react';

import { Textarea } from '@framework/components/forms/Textarea';
import { Button } from '@framework/components/primitives/Button';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import * as yaml from 'js-yaml';
import { AlertCircle, Check, X } from 'lucide-react';

interface YamlEditorProps {
	initialValue: string;
	onSave: (value: string) => void;
	onCancel: () => void;
}

export function YamlEditor({ initialValue, onSave, onCancel }: YamlEditorProps) {
	const [value, setValue] = useState(initialValue);
	const [error, setError] = useState<string | null>(null);

	const handleSave = () => {
		try {
			yaml.load(value);
			setError(null);
			onSave(value);
		} catch (err) {
			setError(getErrorMessage(err));
		}
	};

	return (
		<div className="flex h-full flex-col">
			<Textarea
				value={value}
				onChange={e => setValue(e.target.value)}
				className="flex-1 resize-none bg-muted p-3 font-mono text-xs"
				spellCheck={false}
			/>

			{error && (
				<div
					className={`
       flex items-center gap-2 border-t bg-destructive/10 p-2 text-xs
       text-destructive
     `}
				>
					<AlertCircle className="size-4" />
					{error}
				</div>
			)}

			<div className="flex gap-2 border-t p-2">
				<Button size="sm" onClick={handleSave}>
					<Check className="size-4" />
					Apply
				</Button>
				<Button size="sm" variant="ghost" onClick={onCancel}>
					<X className="size-4" />
					Cancel
				</Button>
			</div>
		</div>
	);
}
