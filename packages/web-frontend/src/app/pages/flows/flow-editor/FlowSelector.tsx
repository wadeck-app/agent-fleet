import { useState } from 'react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { Button } from '@framework/components/primitives/Button';
import { FolderOpen } from 'lucide-react';

interface FlowSelectorProps {
	availableFlows: Array<{ id: string; name: string; description: string }>;
	currentFlowId: string | null;
	onLoadFlow: (flowId: string) => void;
}

export function FlowSelector({ availableFlows, currentFlowId, onLoadFlow }: FlowSelectorProps) {
	const [selectedFlowId, setSelectedFlowId] = useState<string>(currentFlowId || '');

	const handleLoadFlow = () => {
		if (selectedFlowId && selectedFlowId !== currentFlowId) {
			onLoadFlow(selectedFlowId);
		}
	};

	return (
		<div className="flex items-center gap-2">
			<Select value={selectedFlowId} onValueChange={setSelectedFlowId}>
				<SelectTrigger className="w-[300px]">
					<SelectValue placeholder="Select a flow to load..." />
				</SelectTrigger>
				<SelectContent>
					{availableFlows.map(flow => (
						<SelectItem key={flow.id} value={flow.id}>
							<div className="flex items-center gap-2">
								<span className="font-medium">{flow.name}</span>
								<span className="text-xs text-muted-foreground">({flow.id})</span>
							</div>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Button
				variant="outline"
				size="sm"
				onClick={handleLoadFlow}
				disabled={!selectedFlowId || selectedFlowId === currentFlowId}
			>
				<FolderOpen className="mr-2 size-4" />
				Load
			</Button>
		</div>
	);
}
