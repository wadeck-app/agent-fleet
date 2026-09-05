import { useState } from 'react';

import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';
import { Textarea } from '@framework/components/forms/Textarea';
import { Button } from '@framework/components/primitives/Button';
import { useToast } from '@framework/features/toast/ToastContext';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import { Loader2 } from 'lucide-react';

import { flowProposalsApi } from './flowProposalsApi';

interface AddReviewThreadFormProps {
	ticketId: string;
	proposalId: string;
	onAdded: () => void;
	onCancel: () => void;
}

export function AddReviewThreadForm({ ticketId, proposalId, onAdded, onCancel }: AddReviewThreadFormProps) {
	const { showToast } = useToast();
	const [startLine, setStartLine] = useState('');
	const [endLine, setEndLine] = useState('');
	const [comment, setComment] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async () => {
		const start = parseInt(startLine, 10);
		const end = parseInt(endLine, 10);
		if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
			showToast('Please enter valid line numbers (start <= end, both >= 1)', 'error');
			return;
		}
		if (!comment.trim()) {
			showToast('Comment cannot be empty', 'error');
			return;
		}

		setIsSubmitting(true);
		try {
			await flowProposalsApi.createReviewThread(ticketId, proposalId, {
				selector: { startLine: start, endLine: end },
				comment: comment.trim(),
			});
			onAdded();
			showToast('Review thread added', 'success');
		} catch (err) {
			showToast(`Failed to add review thread: ${getErrorMessage(err)}`, 'error');
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="rounded-md border bg-card p-4 space-y-3">
			<p className="text-sm font-medium">Add review thread</p>
			<div className="flex gap-2">
				<div className="flex-1 space-y-1">
					<Label htmlFor="review-start-line" className="text-xs text-muted-foreground">Start line</Label>
					<Input id="review-start-line" type="number" min={1} value={startLine} onChange={e => setStartLine(e.target.value)} placeholder="1" />
				</div>
				<div className="flex-1 space-y-1">
					<Label htmlFor="review-end-line" className="text-xs text-muted-foreground">End line</Label>
					<Input id="review-end-line" type="number" min={1} value={endLine} onChange={e => setEndLine(e.target.value)} placeholder="1" />
				</div>
			</div>
			<Textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Write your review comment..." className="text-sm" />
			<div className="flex gap-2">
				<Button size="sm" onClick={handleSubmit} disabled={isSubmitting}>
					{isSubmitting ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
					Add thread
				</Button>
				<Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
			</div>
		</div>
	);
}
