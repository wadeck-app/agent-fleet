import { useState } from 'react';

import { Field } from '@framework/components/advanced/Field/Field';
import { FieldError } from '@framework/components/advanced/Field/FieldError';
import { FieldLabel } from '@framework/components/advanced/Field/FieldLabel';
import { Textarea } from '@framework/components/forms/Textarea';
import { Button } from '@framework/components/primitives/Button';
import { Eye, FileText } from 'lucide-react';

import { type BaseFieldProps, generateFieldId } from '../fieldUtils';

/**
 * ===========================================================================================
 * MARKDOWN FIELD - Markdown input with optional preview
 * ===========================================================================================
 *
 * Specialized field component for markdown text input.
 *
 * - Multi-line textarea with monospace font
 * - Toggle between edit and preview modes
 * - Simple markdown rendering (no heavy dependencies)
 * - Uses shadcn Field system
 *
 * ===========================================================================================
 */

export interface MarkdownFieldProps extends BaseFieldProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
	rows?: number;
}

export function MarkdownField({
	label,
	value,
	onChange,
	placeholder,
	required = false,
	disabled = false,
	rows = 6,
	error,
	className = '',
	id,
	description,
}: MarkdownFieldProps) {
	const inputId = generateFieldId(label, id);
	const [showPreview, setShowPreview] = useState(false);

	//  WARNING -- FIX ME (XSS)
	// renderMarkdownPreview injects regex-substituted HTML via dangerouslySetInnerHTML
	// without escaping $1 capture groups first. A value containing e.g.
	//   **<img onerror=alert(1)>**
	// produces <strong><img onerror=alert(1)></strong> which executes in the browser.
	// inputDef.default (a server-supplied value) can reach this path via CreateTaskDialog.
	//
	// FIX: replace this function + dangerouslySetInnerHTML below with <ReactMarkdown>
	// (already a project dependency -- see TicketCommentsSection.tsx for usage pattern).
	// No DOMPurify needed: ReactMarkdown renders via React components, never innerHTML.
	const renderMarkdownPreview = (text: string): string => {
		if (!text) return '';

		return text
			.replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
			.replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mt-4 mb-2">$1</h2>')
			.replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>')
			.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
			.replace(/\*(.*?)\*/g, '<em>$1</em>')
			.replace(/`(.*?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-sm">$1</code>')
			.replace(/\n\n/g, '</p><p class="mt-2">')
			.replace(/\n/g, '<br />');
	};

	return (
		<Field className={className} data-disabled={disabled}>
			<div className="flex items-center justify-between">
				<FieldLabel htmlFor={inputId}>
					{label}
					{required && <span className="ml-1 text-destructive">*</span>}
				</FieldLabel>
				<div className="flex gap-1">
					<Button
						type="button"
						variant={showPreview ? 'ghost' : 'secondary'}
						size="sm"
						onClick={() => setShowPreview(false)}
						disabled={disabled}
						className="h-7 px-2"
					>
						<FileText className="mr-1 h-3.5 w-3.5" />
						Edit
					</Button>
					<Button
						type="button"
						variant={showPreview ? 'secondary' : 'ghost'}
						size="sm"
						onClick={() => setShowPreview(true)}
						disabled={disabled || !value}
						className="h-7 px-2"
					>
						<Eye className="mr-1 h-3.5 w-3.5" />
						Preview
					</Button>
				</div>
			</div>
			{showPreview ? (
				<div
					className={`
       min-h-[120px] rounded-md border border-input bg-background px-3 py-2
       text-sm
     `}
					dangerouslySetInnerHTML={{ __html: `<p>${renderMarkdownPreview(value)}</p>` }}
				/>
			) : (
				<Textarea
					id={inputId}
					value={value}
					onChange={e => onChange(e.target.value)}
					placeholder={placeholder || 'Enter markdown text...'}
					required={required}
					disabled={disabled}
					rows={rows}
					aria-invalid={!!error}
					className="font-mono text-sm"
				/>
			)}
			{description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
			{error && <FieldError>{error}</FieldError>}
		</Field>
	);
}
