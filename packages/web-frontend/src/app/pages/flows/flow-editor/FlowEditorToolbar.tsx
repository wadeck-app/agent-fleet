import { Button } from '@framework/components/primitives/Button';
import { Separator } from '@framework/components/primitives/Separator';
import type { FlowListItem } from '@shared/api/flows.contract';
import { Brain, CheckCircle, GitBranch, Hash, Layout, Save, Tag, Terminal, Workflow } from 'lucide-react';

import { FlowSelector } from './FlowSelector';

interface FlowEditorToolbarProps {
	onSave: () => void;
	onValidate: () => void;
	onAutoLayout: () => void;
	onAddNode: (type: 'model' | 'script' | 'subflow' | 'constant') => void;
	onLoadFlow: (flowId: string) => void;
	availableFlows: FlowListItem[];
	currentFlowId: string | null;
	isDirty: boolean;
	isSaving: boolean;
	// Edge visibility toggles
	showDependencyEdges: boolean;
	showDataFlowEdges: boolean;
	showEdgeLabels: boolean;
	onToggleDependencyEdges: () => void;
	onToggleDataFlowEdges: () => void;
	onToggleEdgeLabels: () => void;
}

export function FlowEditorToolbar({
	onSave,
	onValidate,
	onAutoLayout,
	onAddNode,
	onLoadFlow,
	availableFlows,
	currentFlowId,
	isDirty,
	isSaving,
	showDependencyEdges,
	showDataFlowEdges,
	showEdgeLabels,
	onToggleDependencyEdges,
	onToggleDataFlowEdges,
	onToggleEdgeLabels,
}: FlowEditorToolbarProps) {
	const onDragStart = (event: React.DragEvent, nodeType: string) => {
		event.dataTransfer.setData('application/reactflow', nodeType);
		event.dataTransfer.effectAllowed = 'move';
	};

	return (
		<div className="flex flex-col gap-3 border-b bg-card/50 p-4">
			{/* Flow Selector */}
			<FlowSelector availableFlows={availableFlows} currentFlowId={currentFlowId} onLoadFlow={onLoadFlow} />

			<div className="flex items-center gap-4">
				<Button
					variant="ghost"
					size="sm"
					draggable
					onDragStart={e => onDragStart(e, 'model')}
					onClick={() => onAddNode('model')}
					className="h-8"
				>
					<Brain className="mr-2 size-4" />
					Model
				</Button>
				<Button
					variant="ghost"
					size="sm"
					draggable
					onDragStart={e => onDragStart(e, 'script')}
					onClick={() => onAddNode('script')}
					className="h-8"
				>
					<Terminal className="mr-2 size-4" />
					Script
				</Button>
				<Button
					variant="ghost"
					size="sm"
					draggable
					onDragStart={e => onDragStart(e, 'subflow')}
					onClick={() => onAddNode('subflow')}
					className="h-8"
				>
					<Workflow className="mr-2 size-4" />
					SubFlow
				</Button>
				<Button
					variant="ghost"
					size="sm"
					draggable
					onDragStart={e => onDragStart(e, 'constant')}
					onClick={() => onAddNode('constant')}
					className="h-8"
				>
					<Hash className="mr-2 size-4" />
					Constant
				</Button>

				<Separator orientation="vertical" className="h-8" />

				{/* Edge Visibility Toggles */}
				<div className="flex items-center gap-2">
					<span className="mr-1 text-xs font-medium text-muted-foreground">Show:</span>
					<Button
						variant={showDependencyEdges ? 'default' : 'outline'}
						size="sm"
						onClick={onToggleDependencyEdges}
						className="h-8"
					>
						<GitBranch className="mr-2 size-4" />
						Dependencies
					</Button>
					<Button
						variant={showDataFlowEdges ? 'default' : 'outline'}
						size="sm"
						onClick={onToggleDataFlowEdges}
						className="h-8"
					>
						<Workflow className="mr-2 size-4" />
						Data Flow
					</Button>
					<Button
						variant={showEdgeLabels ? 'default' : 'outline'}
						size="sm"
						onClick={onToggleEdgeLabels}
						className="h-8"
						title={showEdgeLabels ? 'Hide edge labels' : 'Show edge labels'}
					>
						<Tag className="mr-2 size-4" />
						Labels
					</Button>
				</div>

				<Separator orientation="vertical" className="h-8" />

				{/* Flow Actions */}
				<div className="flex items-center gap-2">
					<span className="mr-1 text-xs font-medium text-muted-foreground">Actions:</span>
					<Button variant="outline" size="sm" onClick={onAutoLayout}>
						<Layout className="mr-2 size-4" />
						Auto Layout
					</Button>
					<Button variant="outline" size="sm" onClick={onValidate}>
						<CheckCircle className="mr-2 size-4" />
						Validate
					</Button>
					<Button variant="default" size="sm" onClick={onSave} disabled={!isDirty || isSaving}>
						<Save className="mr-2 size-4" />
						{isSaving ? 'Saving...' : isDirty ? 'Save' : 'Saved'}
					</Button>
				</div>
			</div>
		</div>
	);
}
