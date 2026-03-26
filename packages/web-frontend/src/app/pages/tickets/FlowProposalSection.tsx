import { useEffect, useRef, useState } from 'react';

import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';
import { Textarea } from '@framework/components/forms/Textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@framework/components/overlays/Dialog';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@framework/components/primitives/Tooltip';
import { useToast } from '@framework/features/toast/ToastContext';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { FlowProposal, FlowProposalStatus, FlowReviewThread } from '@shared/api/flow-proposals.contract';
import { B2F_FLOW_PROPOSAL_UPDATED } from '@shared/transport';
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import * as yaml from 'js-yaml';
import { Loader2, Pencil, Trash2 } from 'lucide-react';

import { useTransport } from '@/transport';

import { FlowEditorPropertiesPanel } from '../flows/flow-editor/FlowEditorPropertiesPanel';
import { edgeTypes } from '../flows/flow-editor/edges';
import { nodeTypes } from '../flows/flow-editor/nodes';
import type { FlowEdge, FlowNode } from '../flows/flow-editor/types';
import { flowDefinitionToReactFlow } from '../flows/flow-editor/utils/flowToReactFlow';
import { CollapsibleSection } from './CollapsibleSection';
import { flowProposalsApi } from './flowProposalsApi';
import { useFlowProposals } from './useFlowProposals';

interface FlowProposalSectionProps {
	ticketId: string;
	onTicketRefresh?: () => void;
}

function getStatusBadgeVariant(status: FlowProposalStatus): 'warning' | 'success' | 'destructive' | 'secondary' {
	switch (status) {
		case 'pending_review':
			return 'warning';
		case 'approved':
			return 'success';
		case 'rejected':
			return 'destructive';
		case 'superseded':
			return 'secondary';
	}
}

function getStatusLabel(status: FlowProposalStatus): string {
	switch (status) {
		case 'pending_review':
			return 'Pending Review';
		case 'approved':
			return 'Approved';
		case 'rejected':
			return 'Rejected';
		case 'superseded':
			return 'Superseded';
	}
}

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

function ReviewThreadItem({ thread, ticketId, proposalId, onResolved, onDeleted, onUpdated }: ReviewThreadItemProps) {
	const { showToast } = useToast();
	const [replyText, setReplyText] = useState('');
	const [showReplyForm, setShowReplyForm] = useState(false);
	const [isReplying, setIsReplying] = useState(false);
	const [isResolving, setIsResolving] = useState(false);

	// Delete thread state
	const [isPendingDelete, setIsPendingDelete] = useState(false);

	// Edit thread selector state
	const [isEditingSelector, setIsEditingSelector] = useState(false);
	const [editStartLine, setEditStartLine] = useState(String(thread.selector.startLine));
	const [editEndLine, setEditEndLine] = useState(String(thread.selector.endLine));
	const [editSelectedText, setEditSelectedText] = useState(thread.selector.selectedText ?? '');
	const [isSavingSelector, setIsSavingSelector] = useState(false);
	// Optimistic local selector (shown while saving)
	const [localSelector, setLocalSelector] = useState(thread.selector);

	// Per-comment delete state
	const [pendingDeleteCommentId, setPendingDeleteCommentId] = useState<string | null>(null);

	// Per-comment edit state
	const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
	const [editCommentContent, setEditCommentContent] = useState('');
	const [isSavingComment, setIsSavingComment] = useState(false);
	// Optimistic local comment content map
	const [localCommentContent, setLocalCommentContent] = useState<Record<string, string>>({});

	const handleReply = async () => {
		if (!replyText.trim()) return;
		setIsReplying(true);
		try {
			await flowProposalsApi.addReviewComment(ticketId, proposalId, thread.id, {
				content: replyText.trim(),
			});
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
		// Optimistic update
		const prevSelector = localSelector;
		const newSelector = {
			...localSelector,
			startLine: start,
			endLine: end,
			selectedText: editSelectedText || undefined,
		};
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
		// Optimistic update
		const prevContent =
			localCommentContent[commentId] ?? thread.comments.find(c => c.id === commentId)?.content ?? '';
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
			{/* Thread header */}
			{isEditingSelector ? (
				<div className="space-y-2">
					<p className="text-xs font-medium text-muted-foreground">Edit line range</p>
					<div className="flex gap-2">
						<div className="flex-1 space-y-1">
							<Label htmlFor={`edit-start-${thread.id}`} className="text-xs text-muted-foreground">
								Start line
							</Label>
							<Input
								id={`edit-start-${thread.id}`}
								type="number"
								min={1}
								value={editStartLine}
								onChange={e => setEditStartLine(e.target.value)}
								className="h-7 text-xs"
							/>
						</div>
						<div className="flex-1 space-y-1">
							<Label htmlFor={`edit-end-${thread.id}`} className="text-xs text-muted-foreground">
								End line
							</Label>
							<Input
								id={`edit-end-${thread.id}`}
								type="number"
								min={1}
								value={editEndLine}
								onChange={e => setEditEndLine(e.target.value)}
								className="h-7 text-xs"
							/>
						</div>
						<div className="flex-[2] space-y-1">
							<Label htmlFor={`edit-text-${thread.id}`} className="text-xs text-muted-foreground">
								Selected text (optional)
							</Label>
							<Input
								id={`edit-text-${thread.id}`}
								type="text"
								value={editSelectedText}
								onChange={e => setEditSelectedText(e.target.value)}
								className="h-7 text-xs"
							/>
						</div>
					</div>
					<div className="flex gap-2">
						<Button size="sm" onClick={handleSaveSelector} disabled={isSavingSelector}>
							{isSavingSelector ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
							Save
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setIsEditingSelector(false)}
							disabled={isSavingSelector}
						>
							Cancel
						</Button>
					</div>
				</div>
			) : (
				<div className="flex items-center gap-2">
					<span className="font-mono text-xs text-muted-foreground">
						Lines {localSelector.startLine}
						{'\u2013'}
						{localSelector.endLine}
					</span>
					<Badge variant={thread.status === 'open' ? 'warning' : 'success'} className="text-xs">
						{thread.status}
					</Badge>
					{localSelector.selectedText && (
						<code className="max-w-[200px] truncate rounded bg-muted px-1 py-0.5 font-mono text-xs">
							{localSelector.selectedText}
						</code>
					)}
					{/* Thread-level edit/delete buttons — always visible */}
					<div className="ml-auto flex items-center gap-1">
						<Button
							variant="ghost"
							size="icon-xs"
							className="text-muted-foreground"
							onClick={handleOpenEditSelector}
							title="Edit line range"
						>
							<Pencil />
						</Button>
						<Button
							variant="ghost"
							size="icon-xs"
							className="text-muted-foreground hover:text-destructive"
							onClick={handleDeleteThread}
							title="Delete thread"
						>
							<Trash2 />
						</Button>
					</div>
				</div>
			)}

			{/* Comments */}
			<div className="space-y-2">
				{thread.comments.map(comment => {
					const isPendingCommentDelete = pendingDeleteCommentId === comment.id;
					const isEditingThis = editingCommentId === comment.id;
					const displayContent = localCommentContent[comment.id] ?? comment.content;

					return (
						<div
							key={comment.id}
							className={`rounded border-l-2 border-muted-foreground/30 pl-3 transition-opacity${isPendingCommentDelete ? ' opacity-50 line-through pointer-events-none' : ''}`}
						>
							<div className="flex items-center gap-2 mb-1">
								<Badge variant="outline" className="text-xs">
									{comment.author}
								</Badge>
								<span className="text-xs text-muted-foreground">
									{new Date(comment.createdAt).toLocaleString()}
								</span>
								{/* Per-comment action icons — always visible */}
								<div className="ml-auto flex items-center gap-1">
									<Button
										variant="ghost"
										size="icon-xs"
										className="text-muted-foreground"
										onClick={() => handleStartEditComment(comment.id, displayContent)}
										title="Edit comment"
									>
										<Pencil />
									</Button>
									<Button
										variant="ghost"
										size="icon-xs"
										className="text-muted-foreground hover:text-destructive"
										onClick={() => handleDeleteComment(comment.id)}
										title="Delete comment"
									>
										<Trash2 />
									</Button>
								</div>
							</div>

							{isEditingThis ? (
								<div className="space-y-2 mt-1">
									<Textarea
										value={editCommentContent}
										onChange={e => setEditCommentContent(e.target.value)}
										className="text-sm"
										rows={3}
									/>
									<div className="flex gap-2">
										<Button
											size="sm"
											onClick={handleSaveComment}
											disabled={isSavingComment || !editCommentContent.trim()}
										>
											{isSavingComment ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
											Save
										</Button>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => setEditingCommentId(null)}
											disabled={isSavingComment}
										>
											Cancel
										</Button>
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
						<Button
							variant="outline"
							size="sm"
							onClick={() => setShowReplyForm(v => !v)}
							disabled={isReplying || isResolving}
						>
							Add reply
						</Button>
						<Button variant="ghost" size="sm" onClick={handleResolve} disabled={isResolving || isReplying}>
							{isResolving ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
							Resolve
						</Button>
					</>
				)}
			</div>

			{showReplyForm && (
				<div className="space-y-2">
					<Textarea
						value={replyText}
						onChange={e => setReplyText(e.target.value)}
						placeholder="Write a reply..."
						className="text-sm"
					/>
					<div className="flex gap-2">
						<Button size="sm" onClick={handleReply} disabled={isReplying || !replyText.trim()}>
							{isReplying ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
							Submit reply
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								setShowReplyForm(false);
								setReplyText('');
							}}
						>
							Cancel
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

interface AddReviewThreadFormProps {
	ticketId: string;
	proposalId: string;
	onAdded: () => void;
	onCancel: () => void;
}

function AddReviewThreadForm({ ticketId, proposalId, onAdded, onCancel }: AddReviewThreadFormProps) {
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
					{/* T1 fix: connect label to input via htmlFor/id */}
					<Label htmlFor="review-start-line" className="text-xs text-muted-foreground">
						Start line
					</Label>
					<Input
						id="review-start-line"
						type="number"
						min={1}
						value={startLine}
						onChange={e => setStartLine(e.target.value)}
						placeholder="1"
					/>
				</div>
				<div className="flex-1 space-y-1">
					{/* T1 fix: connect label to input via htmlFor/id */}
					<Label htmlFor="review-end-line" className="text-xs text-muted-foreground">
						End line
					</Label>
					<Input
						id="review-end-line"
						type="number"
						min={1}
						value={endLine}
						onChange={e => setEndLine(e.target.value)}
						placeholder="1"
					/>
				</div>
			</div>
			<Textarea
				value={comment}
				onChange={e => setComment(e.target.value)}
				placeholder="Write your review comment..."
				className="text-sm"
			/>
			<div className="flex gap-2">
				<Button size="sm" onClick={handleSubmit} disabled={isSubmitting}>
					{isSubmitting ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
					Add thread
				</Button>
				<Button variant="ghost" size="sm" onClick={onCancel}>
					Cancel
				</Button>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// VisualizeFlowDialog — read-only ReactFlow graph for a proposed flow
// ---------------------------------------------------------------------------

interface VisualizeFlowDialogProps {
	proposal: FlowProposal;
}

function VisualizeFlowDialog({ proposal }: VisualizeFlowDialogProps) {
	const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);

	const flowName =
		typeof (proposal.proposedFlow as Record<string, unknown>)['name'] === 'string'
			? String((proposal.proposedFlow as Record<string, unknown>)['name'])
			: 'Flow preview';

	// Convert proposedFlow to ReactFlow nodes/edges using the same utility as the flow editor
	let nodes: FlowNode[] = [];
	let edges: FlowEdge[] = [];
	try {
		const converted = flowDefinitionToReactFlow(
			proposal.proposedFlow as unknown as Parameters<typeof flowDefinitionToReactFlow>[0]
		);
		nodes = converted.nodes;
		edges = converted.edges;
	} catch {
		// Fallback: if conversion fails, show nothing (canvas will be empty)
	}

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm" className="h-auto py-1 text-xs">
					Visualize
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[85vw] w-[85vw]">
				<DialogHeader>
					<DialogTitle>{flowName}</DialogTitle>
				</DialogHeader>
				{/* Two-column layout: ReactFlow canvas left, step details panel right */}
				<div className="grid grid-cols-[1fr_384px] overflow-hidden rounded-md border">
					{/* Left column: ReactFlow canvas */}
					<div className="h-[75vh] w-full overflow-hidden">
						<ReactFlowProvider>
							<ReactFlow
								nodes={nodes}
								edges={edges}
								nodeTypes={nodeTypes}
								edgeTypes={edgeTypes}
								fitView
								nodesDraggable={false}
								nodesConnectable={false}
								elementsSelectable={true}
								panOnDrag={true}
								zoomOnScroll={true}
								proOptions={{ hideAttribution: true }}
								className="h-full w-full bg-muted/20"
								onNodeClick={(_event, node) => setSelectedNode(node as FlowNode)}
								onPaneClick={() => setSelectedNode(null)}
							>
								<Background />
								<Controls position="bottom-left" />
								<MiniMap
									nodeColor={node => {
										if (node.type === 'model') return 'hsl(var(--primary))';
										if (node.type === 'script') return 'hsl(var(--secondary))';
										if (node.type === 'subflow') return 'hsl(var(--accent))';
										return 'hsl(var(--muted))';
									}}
									className="!border-border !bg-card"
									zoomable
									pannable
								/>
							</ReactFlow>
						</ReactFlowProvider>
					</div>
					{/* Right column: read-only step details panel */}
					<FlowEditorPropertiesPanel
						selectedNode={selectedNode}
						readOnly
						onUpdateNode={() => {}}
						onDeleteNode={() => {}}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}

interface ProposalViewProps {
	proposal: FlowProposal;
	ticketId: string;
	onRefresh: () => void;
	onReviewUpdated: () => void;
	/** Called after successful rejection so the parent can show the redesigning banner */
	onRejected: () => void;
	/** Answers filled in the "Questions from the AI" section — forwarded to the parent for re-design context */
	onQuestionAnswersChange: (answers: Record<number, string>) => void;
}

function ProposalView({
	proposal,
	ticketId,
	onRefresh,
	onReviewUpdated,
	onRejected,
	onQuestionAnswersChange,
}: ProposalViewProps) {
	const { showToast } = useToast();
	const [showAddThread, setShowAddThread] = useState(false);
	const [rejectReason, setRejectReason] = useState('');
	const [showRejectForm, setShowRejectForm] = useState(false);
	const [isApproving, setIsApproving] = useState(false);
	const [isRejecting, setIsRejecting] = useState(false);
	const [questionAnswers, setQuestionAnswers] = useState<Record<number, string>>({});
	const rejectFormRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (showRejectForm) {
			rejectFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
	}, [showRejectForm]);

	// Propagate answer changes to parent so it can pass them to handleRequestDesign
	const handleAnswerChange = (index: number, value: string) => {
		const updated = { ...questionAnswers, [index]: value };
		setQuestionAnswers(updated);
		onQuestionAnswersChange(updated);
	};

	const proposalYaml = yaml.dump(proposal.proposedFlow, { indent: 2, lineWidth: 120 });

	const handleApprove = async () => {
		setIsApproving(true);
		try {
			await flowProposalsApi.approveProposal(ticketId, proposal.id);
			showToast('Proposal approved', 'success');
			onRefresh();
		} catch (err) {
			showToast(`Failed to approve: ${getErrorMessage(err)}`, 'error');
		} finally {
			setIsApproving(false);
		}
	};

	const handleReject = async () => {
		setIsRejecting(true);
		try {
			await flowProposalsApi.rejectProposal(ticketId, proposal.id, rejectReason || undefined);
			showToast('Proposal rejected. AI is redesigning...', 'success');
			setShowRejectForm(false);
			setRejectReason('');
			onRejected();
		} catch (err) {
			showToast(`Failed to reject: ${getErrorMessage(err)}`, 'error');
		} finally {
			setIsRejecting(false);
		}
	};

	/** B7 fix: handleToggleRejectForm only opens the form — closing is done by the Cancel button inside */
	const handleToggleRejectForm = () => {
		// Prepend filled question answers to the rejection reason textarea
		setShowRejectForm(true);
		const filledAnswers = Object.entries(questionAnswers)
			.filter(([, answer]) => answer.trim())
			.map(([idxStr, answer]) => {
				const idx = parseInt(idxStr, 10);
				const question = proposal.openQuestions?.[idx] ?? `Question ${idx + 1}`;
				return `Q: ${question}\nA: ${answer}`;
			});
		if (filledAnswers.length > 0) {
			setRejectReason(`Answers to AI questions:\n${filledAnswers.join('\n\n')}\n\n`);
		}
	};

	const isPendingReview = proposal.status === 'pending_review';
	const isTerminal = proposal.status === 'approved' || proposal.status === 'rejected';

	const reasoningSentences = proposal.reasoning.split(/\.\s+|\n/).filter(s => s.trim());

	// K fix: extract the flow ID from proposedFlow for the editor link
	const proposedFlowId =
		typeof proposal.proposedFlow['id'] === 'string' ? (proposal.proposedFlow['id'] as string) : null;

	// c fix: open questions from the proposal (API-provided list)
	const openQuestions = proposal.openQuestions ?? [];

	return (
		<div className="space-y-4">
			{/* Header */}
			<div className="flex flex-wrap items-center gap-2">
				<Badge variant="outline" className="font-mono text-xs">
					v{proposal.version}
				</Badge>
				<Badge variant={getStatusBadgeVariant(proposal.status)}>{getStatusLabel(proposal.status)}</Badge>
				{proposal.confidenceScore !== undefined && (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="cursor-help text-sm text-muted-foreground underline decoration-dotted">
									Confidence: {Math.round(proposal.confidenceScore)}%
								</span>
							</TooltipTrigger>
							{/* c fix: tooltip shows generic description only — open questions moved to inline section */}
							<TooltipContent className="max-w-[300px] text-xs">
								<p>
									Confidence reflects how well the flow agent understood the ticket requirements.
									Below 90% typically means: missing details in the ticket description, ambiguous
									requirements, or open questions the agent could not resolve.
								</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				)}
				<span className="ml-auto text-xs text-muted-foreground">
					Proposed {new Date(proposal.proposedAt).toLocaleString()}
				</span>
			</div>

			{/* Adaptations — only on redesigns (version > 1), not on first design (ba/ce fix) */}
			{proposal.adaptations && proposal.adaptations.length > 0 && proposal.version > 1 && (
				<div className="space-y-1">
					<p className="text-xs font-medium text-muted-foreground tracking-wide">Adaptations</p>
					<ul className="list-disc list-inside space-y-0.5">
						{proposal.adaptations.map((a, i) => (
							<li key={i} className="text-sm">
								{a}
							</li>
						))}
					</ul>
				</div>
			)}

			{/* W5 fix: Questions from the AI — uses CollapsibleSection instead of manual chevron toggle */}
			{openQuestions.length > 0 && (
				<CollapsibleSection
					title="Questions from the AI"
					defaultOpen={false}
					headerRight={
						<span className="text-xs font-normal text-muted-foreground">
							{openQuestions.length} question{openQuestions.length !== 1 ? 's' : ''}
						</span>
					}
				>
					<div className="space-y-4">
						<p className="text-sm text-muted-foreground">
							The AI raised these questions about the requirements. Answering them will improve the next
							design. Answers are automatically included when you reject the proposal.
						</p>
						{/* B9 fix: connect labels to textareas via htmlFor/id */}
						{openQuestions.map((question, i) => (
							<div key={i} className="space-y-1">
								<Label htmlFor={`question-answer-${i}`} className="text-sm font-medium">
									{question}
								</Label>
								<Textarea
									id={`question-answer-${i}`}
									value={questionAnswers[i] ?? ''}
									onChange={e => handleAnswerChange(i, e.target.value)}
									placeholder="Your answer (optional)..."
									className="text-sm"
									rows={2}
								/>
							</div>
						))}
					</div>
				</CollapsibleSection>
			)}

			{/* D1 fix: Reasoning collapsed by default using CollapsibleSection */}
			<CollapsibleSection title="Reasoning" defaultOpen={false}>
				{reasoningSentences.length > 1 ? (
					<ul className="list-disc list-inside space-y-1">
						{reasoningSentences.map((sentence, i) => (
							<li key={i} className="text-sm">
								{sentence.trim().replace(/\.$/, '')}
							</li>
						))}
					</ul>
				) : (
					<p className="text-sm whitespace-pre-wrap">{proposal.reasoning}</p>
				)}
			</CollapsibleSection>

			{/* D1/D2 fix: Proposed flow collapsed by default; Visualize button for non-approved proposals */}
			<CollapsibleSection
				title="Proposed flow"
				defaultOpen={false}
				headerRight={
					proposal.status === 'approved' && proposedFlowId ? (
						/* K fix: real link only when approved (flow registered in registry) */
						<a
							href={`/flows/${proposedFlowId}/edit`}
							target="_blank"
							rel="noopener noreferrer"
							className="text-xs text-primary hover:underline"
						>
							Open in Flow Editor
						</a>
					) : (
						/* D2 fix: Visualize button opens a ReactFlow read-only modal for non-approved proposals */
						<VisualizeFlowDialog proposal={proposal} />
					)
				}
			>
				<pre className="overflow-x-auto rounded-md bg-muted p-4 text-xs font-mono leading-relaxed">
					{proposalYaml}
				</pre>
			</CollapsibleSection>

			{/* Review threads */}
			{proposal.reviewThreads.length > 0 && (
				<div className="space-y-2">
					<p className="text-xs font-medium text-muted-foreground tracking-wide">
						Review threads ({proposal.reviewThreads.length})
					</p>
					{proposal.reviewThreads.map(thread => (
						<ReviewThreadItem
							key={thread.id}
							thread={thread}
							ticketId={ticketId}
							proposalId={proposal.id}
							onResolved={onReviewUpdated}
							onDeleted={onReviewUpdated}
							onUpdated={onReviewUpdated}
						/>
					))}
				</div>
			)}

			{/* Add review thread */}
			{isPendingReview && (
				<div className="space-y-2">
					{showAddThread ? (
						<AddReviewThreadForm
							ticketId={ticketId}
							proposalId={proposal.id}
							onAdded={() => {
								setShowAddThread(false);
								onReviewUpdated();
							}}
							onCancel={() => setShowAddThread(false)}
						/>
					) : (
						<Button variant="outline" size="sm" onClick={() => setShowAddThread(true)}>
							Add review thread
						</Button>
					)}
				</div>
			)}

			{/* Actions for pending_review */}
			{isPendingReview && (
				<div className="flex flex-wrap items-start gap-3 border-t pt-4">
					<Button onClick={handleApprove} disabled={isApproving || isRejecting} variant="default">
						{isApproving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
						Approve
					</Button>

					{/* B7 fix: toggle button is always "Reject..." (destructive) — no longer toggles to "Cancel".
					    Cancel is now inside the reject form. */}
					<Button
						variant="destructive"
						onClick={handleToggleRejectForm}
						disabled={isApproving || isRejecting || showRejectForm}
					>
						Reject...
					</Button>

					{showRejectForm && (
						<div ref={rejectFormRef} className="w-full space-y-2">
							{/* T2 fix: connect label to textarea via htmlFor/id */}
							<Label htmlFor="reject-reason" className="text-sm font-medium">
								Rejection reason
							</Label>
							<Textarea
								value={rejectReason}
								onChange={e => setRejectReason(e.target.value)}
								id="reject-reason"
								placeholder="Reason for rejection (optional)..."
								className="text-sm"
							/>
							{/* B7 fix: "Confirm rejection" has no size= (default size, same as Approve).
							    "Cancel" button is placed next to it inside the form. */}
							<div className="flex gap-2">
								<Button variant="destructive" onClick={handleReject} disabled={isRejecting}>
									{isRejecting ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
									Confirm rejection
								</Button>
								<Button
									variant="outline"
									onClick={() => {
										setShowRejectForm(false);
										setRejectReason('');
									}}
									disabled={isRejecting}
								>
									Cancel
								</Button>
							</div>
						</div>
					)}
				</div>
			)}

			{/* B4 fix: terminal state shows timestamp only — "Request new design" button removed.
			    The re-request form at the bottom of the page is the only entry point. */}
			{isTerminal && (
				<div className="border-t pt-4">
					<p className="text-sm text-muted-foreground">
						{/* g2 fix: replaced em-dash fallback with descriptive text */}
						{proposal.status === 'approved'
							? `Approved at ${proposal.approvedAt ? new Date(proposal.approvedAt).toLocaleString() : 'unknown date'}`
							: `Rejected at ${proposal.rejectedAt ? new Date(proposal.rejectedAt).toLocaleString() : 'unknown date'}`}
					</p>
				</div>
			)}
		</div>
	);
}

/**
 * ===========================================================================================
 * FLOW PROPOSAL SECTION
 * ===========================================================================================
 *
 * Main section component rendered inside the "Flow Design" tab of TicketDetailLayoutG.
 * Manages the full lifecycle of flow proposals: request, view, review, approve/reject.
 *
 * ===========================================================================================
 */
export function FlowProposalSection({ ticketId, onTicketRefresh }: FlowProposalSectionProps) {
	const { proposals, currentProposal, isLoading, error, refresh, refreshSilent } = useFlowProposals(ticketId);
	const { showToast } = useToast();
	const { transport } = useTransport();

	const [context, setContext] = useState('');
	const [isRequesting, setIsRequesting] = useState(false);
	const [requestError, setRequestError] = useState<string | null>(null);
	/** True after a rejection, while the AI is redesigning. Cleared on WS event. */
	const [isRedesigning, setIsRedesigning] = useState(false);
	/** c fix: question answers from the ProposalView, forwarded to requestFlowDesign */
	const [currentQuestionAnswers, setCurrentQuestionAnswers] = useState<Record<number, string>>({});

	// r1 fix: ref on the root proposals div to scroll to top when redesigning banner appears
	const proposalsSectionRef = useRef<HTMLDivElement>(null);

	// r1 fix: scroll to top when isRedesigning becomes true so the banner is visible
	useEffect(() => {
		if (isRedesigning) {
			proposalsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}, [isRedesigning]);

	// cc fix: subscribe to the flow-specific event so title/label/status updates do NOT
	// trigger a Flow Design refresh. Only fires when a redesign completes asynchronously.
	// ca fix: use refresh() (not refreshSilent()) so the content shows a loading state
	// while fetching the new proposal.
	useEffect(() => {
		const unsub = transport.subscribe(
			B2F_FLOW_PROPOSAL_UPDATED,
			() => {
				setIsRedesigning(false);
				refresh();
				onTicketRefresh?.();
			},
			{ ticketId }
		);
		return unsub;
	}, [ticketId, transport, refresh, onTicketRefresh]);

	const handleRequestDesign = async () => {
		setIsRequesting(true);
		try {
			// c fix: include filled question answers as questionsContext
			const filledAnswers = currentProposal?.openQuestions
				?.map((question, i) => ({ question, answer: currentQuestionAnswers[i] ?? '' }))
				.filter(qa => qa.answer.trim());
			await flowProposalsApi.requestFlowDesign(
				ticketId,
				context || undefined,
				filledAnswers && filledAnswers.length > 0 ? filledAnswers : undefined
			);
			showToast('Flow design requested. AI is processing...', 'success');
			setContext('');
			setCurrentQuestionAnswers({});
			setRequestError(null);
			refresh();
		} catch (err) {
			const msg = getErrorMessage(err);
			showToast(`Failed to request flow design: ${msg}`, 'error');
			setRequestError(msg);
		} finally {
			setIsRequesting(false);
		}
	};

	// Loading state
	if (isLoading) {
		return (
			<div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
				<Loader2 className="size-6 animate-spin" />
				<p className="text-sm">Loading...</p>
			</div>
		);
	}

	// Error state
	if (error) {
		return (
			<div className="py-4">
				<p className="text-sm text-destructive">Failed to load proposals: {error.message}</p>
				<Button variant="outline" size="sm" onClick={refresh} className="mt-2">
					Retry
				</Button>
			</div>
		);
	}

	// No proposals yet -- show request form (with blur overlay when requesting)
	if (proposals.length === 0) {
		return (
			<div className="relative space-y-4 py-4">
				<div className={isRequesting ? 'pointer-events-none opacity-50' : undefined}>
					<p className="text-sm text-muted-foreground">
						No flow design has been requested yet for this ticket.
					</p>
					{requestError && (
						<div className="mt-2 rounded-md border border-destructive/50 bg-destructive/10 p-3">
							<p className="text-sm font-medium text-destructive">Request failed</p>
							<p className="mt-1 whitespace-pre-wrap text-xs text-destructive/80">{requestError}</p>
						</div>
					)}
					<div className="mt-4 space-y-2">
						{/* T3 fix: connect label to textarea via htmlFor/id */}
						<Label htmlFor="context-input" className="text-sm font-medium">
							Additional context (optional)
						</Label>
						<Textarea
							value={context}
							onChange={e => {
								setContext(e.target.value);
								setRequestError(null);
							}}
							id="context-input"
							placeholder="Provide extra context or constraints for the AI flow designer..."
							className="text-sm"
						/>
					</div>
					<div className="mt-4">
						<Button onClick={handleRequestDesign} disabled={isRequesting}>
							Request Flow Design
						</Button>
					</div>
				</div>
				{isRequesting && (
					<div className="absolute inset-0 flex items-center justify-center">
						<div className="flex flex-col items-center gap-2 text-muted-foreground">
							<Loader2 className="size-5 animate-spin" />
							<span className="text-sm">Requesting AI flow design...</span>
						</div>
					</div>
				)}
			</div>
		);
	}

	// Has proposal -- render the current one with option to request a new one
	return (
		// r1 fix: ref attached so scrollIntoView brings the redesigning banner into view after rejection
		<div ref={proposalsSectionRef} className="space-y-6 py-2">
			{/* Redesigning banner -- shown after rejection until WS event clears it (r1 fix) */}
			{isRedesigning && (
				<div className="flex items-center gap-3 rounded-md border border-warning/50 bg-warning/10 px-4 py-3">
					<Loader2 className="size-4 shrink-0 animate-spin text-warning" />
					<p className="text-sm text-warning">Rejection submitted. AI is redesigning the flow...</p>
				</div>
			)}

			{currentProposal && (
				<ProposalView
					proposal={currentProposal}
					ticketId={ticketId}
					onRefresh={() => {
						refresh();
						onTicketRefresh?.();
					}}
					onReviewUpdated={() => {
						// Silent re-fetch: preserves scroll position (item O fix)
						refreshSilent();
					}}
					onRejected={() => {
						setIsRedesigning(true);
					}}
					onQuestionAnswersChange={setCurrentQuestionAnswers}
				/>
			)}

			{/* Request a new design (only when not pending_review and not already redesigning) */}
			{currentProposal && currentProposal.status !== 'pending_review' && !isRedesigning && (
				<div className="border-t pt-4 space-y-3">
					{/* T3 fix: replace <p> with <Label htmlFor> to properly associate with the textarea */}
					<Label htmlFor="new-design-context" className="text-sm font-medium">
						Request a new flow design
					</Label>
					{/* B5 fix: blur textarea while request is in flight */}
					<div className={isRequesting ? 'pointer-events-none opacity-50' : ''}>
						<Textarea
							value={context}
							onChange={e => setContext(e.target.value)}
							id="new-design-context"
							placeholder="Provide additional context or describe what to change..."
							className="text-sm"
						/>
					</div>
					<Button onClick={handleRequestDesign} disabled={isRequesting}>
						{isRequesting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
						Request new design
					</Button>
				</div>
			)}
		</div>
	);
}
