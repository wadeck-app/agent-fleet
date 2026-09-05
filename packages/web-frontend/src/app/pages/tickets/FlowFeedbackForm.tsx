import { useState } from 'react';

import { Button } from '@framework/components/primitives/Button';
import { Label } from '@framework/components/forms/Label';
import { Loader2 } from 'lucide-react';

import { ArrayFieldInput } from './ArrayFieldInput';
import { RatingInput } from './RatingInput';

export interface FormValues {
	rating: number;
	wentWell: string[];
	wentWrong: string[];
	suggestions: string[];
}

interface FlowFeedbackFormProps {
	initialValues?: FormValues;
	onSubmit: (values: FormValues) => Promise<void>;
	/** Optional cancel handler -- shown only when a previous feedback already exists */
	onCancel?: () => void;
}

export function FlowFeedbackForm({ initialValues, onSubmit, onCancel }: FlowFeedbackFormProps) {
	const [rating, setRating] = useState(initialValues?.rating ?? 0);
	const [wentWell, setWentWell] = useState<string[]>(initialValues?.wentWell ?? []);
	const [wentWrong, setWentWrong] = useState<string[]>(initialValues?.wentWrong ?? []);
	const [suggestions, setSuggestions] = useState<string[]>(initialValues?.suggestions ?? []);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const canSubmit = rating >= 1 && !isSubmitting;

	const handleSubmit = async () => {
		if (!canSubmit) return;
		setIsSubmitting(true);
		try {
			await onSubmit({ rating, wentWell, wentWrong, suggestions });
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="relative">
			<div className={`space-y-4 ${isSubmitting ? 'pointer-events-none opacity-50' : ''}`}>
				<p className="text-sm font-medium">Submit Flow Execution Feedback</p>

				{/* Rating */}
				<div className="space-y-1">
					<Label className="text-xs font-medium text-muted-foreground tracking-wide">
						Rating <span className="text-destructive">*</span>
					</Label>
					<RatingInput value={rating} onChange={setRating} />
				</div>

				{/* Array fields */}
				<ArrayFieldInput
					label="What went well"
					items={wentWell}
					onChange={setWentWell}
					placeholder="Add an item and press Enter..."
				/>
				<ArrayFieldInput
					label="What went wrong"
					items={wentWrong}
					onChange={setWentWrong}
					placeholder="Add an item and press Enter..."
				/>
				<ArrayFieldInput
					label="Suggestions"
					items={suggestions}
					onChange={setSuggestions}
					placeholder="Add a suggestion and press Enter..."
				/>

				<div className="flex items-center gap-2">
					<Button onClick={() => void handleSubmit()} disabled={!canSubmit}>
						{isSubmitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
						Submit Feedback
					</Button>
					{/* Cancel button -- only when re-adding (a previous feedback already exists) */}
					{onCancel && (
						<Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
							Cancel
						</Button>
					)}
				</div>
			</div>
			{isSubmitting && (
				<div className="absolute inset-0 flex items-center justify-center">
					<div className="flex flex-col items-center gap-2 text-muted-foreground">
						<Loader2 className="size-5 animate-spin" />
						<span className="text-sm">Submitting feedback...</span>
					</div>
				</div>
			)}
		</div>
	);
}
