import { useState } from 'react';

import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';
import { Textarea } from '@framework/components/forms/Textarea';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { useToast } from '@framework/features/toast/ToastContext';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { FlowReviewThread } from '@shared/api/flow-proposals.contract';
import { Loader2, Pencil, Trash2 } from 'lucide-react';

import { flowProposalsApi } from './flowProposalsApi';

interface ReviewThreadItemProps {
	thread: FlowReviewThread;
	ticketId: string;
	proposalId: string;
	onResolved: () => void;
	/** Called after the thread is fully deleted (parent removes it from the list) */
	onDeleted: () => void;
	/** Called after the thread selector is updated */
	onUpdated: () => void;
}

export function ReviewThreadItem({ thread, ticketId, proposalId, onResolved, onDeleted, onUpdated }: ReviewThreadItemProps) {
	const { showToast } = useToast();
	const [replyText, setReplyText] = useState('');
	const [showReplyForm, setShowReplyForm] = useState(false);
	const [isReplying, setIsReplying] = useState(false);
	const [isResolving, setIsResolving] = useState(false);
	const [isPendingDelete, setIsPendingDelete] = useState(false);
	const [isEditingSelector, setIsEditingSelector] = useState(false);
	const [editStartLine, setEditStartLine] = useState(String(thread.selector.startLine));
	const [editEndLine, setEditEndLine] = useState(String(thread.selector.endLine));
	const [editSelectedText, setEditSelectedText] = useState(thread.selector.selectedText ?? '');
	const [isSavingSelector, setIsSavingSelector] = useState(false);
	const [localSelector, setLocalSelector] = useState(thread.selector);
	const [pendingDeleteCommentId, setPendingDeleteCommentId] = useState<string | null>(null);
	const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
	const [editCommentContent, setEditCommentContent] = useState('');
	const [isSavingComment, setIsSavingComment] = useState(false);
	const [localCommentContent, setLocalCommentContent] = useState<Record<string, string>>({});

	const handleReply = async () => {
		if (!replyText.trim()) return;
		setIsReplying(true);
		try {
			await flowProposalsApi.addReviewComment(ticketId, proposalId, thread.id, { content: replyText.trim() });
			setReplyText('');
			setShowReplyForm(false);
			onResolved();
			showToast('Reply added', 'success');
		} catch (err) {
			showToast(`Failed to add reply: ${getErrorMessage(err)}`, 'error');
		} finally {
			setIsReplying(false);
		}
	};

	const handleResolve = async () => {
		setIsResolving(true);
		try {
			await flowProposalsApi.resolveReviewThread(ticketId, proposalId, thread.id);
			onResolved();
			showToast('Thread resolved', 'success');
		} catch (err) {
			showToast(`Failed to resolve thread: ${getErrorMessage(err)}`, 'error');
		} finally {
			setIsResolving(false);
		}
	};

	const handleDeleteThread = async () => {
		setIsPendingDelete(true);
		try {
			await flowProposalsApi.deleteThread(ticketId, proposalId, thread.id);
			onDeleted();
			showToast('Thread deleted', 'success');
		} catch (err) {
			setIsPendingDelete(false);
			showToast(`Failed to delete thread: ${getErrorMessage(err)}`, 'error');
		}
	};

	const handleOpenEditSelector = () => {
		setEditStartLine(String(localSelector.startLine));
		setEditEndLine(String(localSelector.endLine));
		setEditSelectedText(localSelector.selectedText ?? '');
		setIsEditingSelector(true);
	};

	const handleSaveSelector = async () => {
		const start = parseInt(editStartLine, 10);
		const end = parseInt(editEndLine, 10);
		if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
			showToast('Invalid line range (start <= end, both >= 1)', 'error');
			return;
		}
		const prevSelector = localSelector;
		const newSelector = { ...localSelector, startLine: start, endLine: end, selectedText: editSelectedText || undefined };
		setLocalSelector(newSelector);
		setIsEditingSelector(false);
		setIsSavingSelector(true);
		try {
			await flowProposalsApi.updateThread(ticketId, proposalId, thread.id, {
				selector: { startLine: start, endLine: end, selectedText: editSelectedText || undefined },
			});
			onUpdated();
			showToast('Thread updated', 'success');
		} catch (err) {
			setLocalSelector(prevSelector);
			setIsEditingSelector(true);
			showToast(`Failed to update thread: ${getErrorMessage(err)}`, 'error');
		} finally {
			setIsSavingSelector(false);
		}
	};

	const handleDeleteComment = async (commentId: string) => {
		setPendingDeleteCommentId(commentId);
		try {
			const result = await flowProposalsApi.deleteComment(ticketId, proposalId, thread.id, commentId);
			if (result.threadDeleted) {
				onDeleted();
				showToast('Comment deleted (thread removed)', 'success');
			} else {
				onResolved();
				showToast('Comment deleted', 'success');
			}
		} catch (err) {
			setPendingDeleteCommentId(null);
			showToast(`Failed to delete comment: ${getErrorMessage(err)}`, 'error');
		}
	};

	const handleStartEditComment = (commentId: string, currentContent: string) => {
		setEditingCommentId(commentId);
		setEditCommentContent(currentContent);
	};

	const handleSaveComment = async () => {
		if (!editingCommentId || !editCommentContent.trim()) return;
		const commentId = editingCommentId;
		const newContent = editCommentContent.trim();
		const prevContent = localCommentContent[commentId] ?? thread.comments.find(c => c.id === commentId)?.content ?? '';
		setLocalCommentContent(prev => ({ ...prev, [commentId]: newContent }));
		setEditingCommentId(null);
		setIsSavingComment(true);
		try {
			await flowProposalsApi.updateComment(ticketId, proposalId, thread.id, commentId, { content: newContent });
			onResolved();
			showToast('Comment updated', 'success');
		} catch (err) {
			setLocalCommentContent(prev => ({ ...prev, [commentId]: prevContent }));
			setEditingCommentId(commentId);
			showToast(`Failed to update comment: ${getErrorMessage(err)}`, 'error');
		} finally {
			setIsSavingComment(false);
		}
	};

	return (
		<div
			className={`rounded-md border bg-card p-3 space-y-2 transition-opacity${isPendingDelete ? ' opacity-50 pointer-events-none' : ''}`}
		>
			{isEditingSelector ? (
				<div className="space-y-2">
					<p className="text-xs font-medium text-muted-foreground">Edit line range</p>
					<div className="flex gap-2">
						<div className="flex-1 space-y-1">
							<Label htmlFor={`edit-start-${thread.id}`} className="text-xs text-muted-foreground">Start line</Label>
							<Input id={`edit-start-${thread.id}`} type="number" min={1} value={editStartLine} onChange={e => setEditStartLine(e.target.value)} className="h-7 text-xs" />
						</div>
						<div className="flex-1 space-y-1">
							<Label htmlFor={`edit-end-${thread.id}`} className="text-xs text-muted-foreground">End line</Label>
							<Input id={`edit-end-${thread.id}`} type="number" min={1} value={editEndLine} onChange={e => setEditEndLine(e.target.value)} className="h-7 text-xs" />
						</div>
						<div className="flex-[2] space-y-1">
							<Label htmlFor={`edit-text-${thread.id}`} className="text-xs text-muted-foreground">Selected text (optional)</Label>
							<Input id={`edit-text-${thread.id}`} type="text" value={editSelectedText} onChange={e => setEditSelectedText(e.target.value)} className="h-7 text-xs" />
						</div>
					</div>
					<div className="flex gap-2">
						<Button size="sm" onClick={handleSaveSelector} disabled={isSavingSelector}>
							{isSavingSelector ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
							Save
						</Button>
						<Button variant="ghost" size="sm" onClick={() => setIsEditingSelector(false)} disabled={isSavingSelector}>Cancel</Button>
					</div>
				</div>
			) : (
				<div className="flex items-center gap-2">
					<span className="font-mono text-xs text-muted-foreground">
						Lines {localSelector.startLine}{'–'}{localSelector.endLine}
					</span>
					<Badge variant={thread.status === 'open' ? 'warning' : 'success'} className="text-xs">{thread.status}</Badge>
					{localSelector.selectedText && (
						<code className="max-w-[200px] truncate rounded bg-muted px-1 py-0.5 font-mono text-xs">{localSelector.selectedText}</code>
					)}
					<div className="ml-auto flex items-center gap-1">
						<Button variant="ghost" size="icon-xs" className="text-muted-foreground" onClick={handleOpenEditSelector} title="Edit line range"><Pencil /></Button>
						<Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-destructive" onClick={handleDeleteThread} title="Delete thread"><Trash2 /></Button>
					</div>
				</div>
			)}

			<div className="space-y-2">
				{thread.comments.map(comment => {
					const isPendingCommentDelete = pendingDeleteCommentId === comment.id;
					const isEditingThis = editingCommentId === comment.id;
					const displayContent = localCommentContent[comment.id] ?? comment.content;
					return (
						<div key={comment.id} className={`rounded border-l-2 border-muted-foreground/30 pl-3 transition-opacity${isPendingCommentDelete ? ' opacity-50 line-through pointer-events-none' : ''}`}>
							<div className="flex items-center gap-2 mb-1">
								<Badge variant="outline" className="text-xs">{comment.author}</Badge>
								<span className="text-xs text-muted-foreground">{new Date(comment.createdAt).toLocaleString()}</span>
								<div className="ml-auto flex items-center gap-1">
									<Button variant="ghost" size="icon-xs" className="text-muted-foreground" onClick={() => handleStartEditComment(comment.id, displayContent)} title="Edit comment"><Pencil /></Button>
									<Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-destructive" onClick={() => handleDeleteComment(comment.id)} title="Delete comment"><Trash2 /></Button>
								</div>
							</div>
							{isEditingThis ? (
								<div className="space-y-2 mt-1">
									<Textarea value={editCommentContent} onChange={e => setEditCommentContent(e.target.value)} className="text-sm" rows={3} />
									<div className="flex gap-2">
										<Button size="sm" onClick={handleSaveComment} disabled={isSavingComment || !editCommentContent.trim()}>
											{isSavingComment ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
											Save
										</Button>
										<Button variant="ghost" size="sm" onClick={() => setEditingCommentId(null)} disabled={isSavingComment}>Cancel</Button>
									</div>
								</div>
							) : (
								<p className="text-sm">{displayContent}</p>
							)}
						</div>
					);
				})}
			</div>

			<div className="flex items-center gap-2">
				{thread.status === 'open' && (
					<>
						<Button variant="outline" size="sm" onClick={() => setShowReplyForm(v => !v)} disabled={isReplying || isResolving}>Add reply</Button>
						<Button variant="ghost" size="sm" onClick={handleResolve} disabled={isResolving || isReplying}>
							{isResolving ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
							Resolve
						</Button>
					</>
				)}
			</div>

			{showReplyForm && (
				<div className="space-y-2">
					<Textarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Write a reply..." className="text-sm" />
					<div className="flex gap-2">
						<Button size="sm" onClick={handleReply} disabled={isReplying || !replyText.trim()}>
							{isReplying ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
							Submit reply
						</Button>
						<Button variant="ghost" size="sm" onClick={() => { setShowReplyForm(false); setReplyText(''); }}>Cancel</Button>
					</div>
				</div>
			)}
		</div>
	);
}
