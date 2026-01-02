import { useMemo } from 'react';

import type { ComboboxOption } from '@framework/features/forms/inputs/ComboboxInput';
import { ComboboxInput } from '@framework/features/forms/inputs/ComboboxInput';

interface FlowSelectorProps {
	availableFlows: Array<{ id: string; name: string; description: string }>;
	currentFlowId: string | null;
	onLoadFlow: (flowId: string) => void;
}

export function FlowSelector({ availableFlows, currentFlowId, onLoadFlow }: FlowSelectorProps) {
	// Transform flows into ComboboxOption format
	const flowOptions: ComboboxOption[] = useMemo(
		() =>
			availableFlows.map(flow => ({
				value: flow.id,
				label: `${flow.name} (${flow.id})`,
			})),
		[availableFlows]
	);

	const handleFlowChange = (flowId: string) => {
		if (flowId && flowId !== currentFlowId) {
			onLoadFlow(flowId);
		}
	};

	return (
		<div className="flex items-center gap-2">
			<div className="w-[300px]">
				<ComboboxInput
					value={currentFlowId || ''}
					onChange={handleFlowChange}
					options={flowOptions}
					placeholder="Search and select a flow..."
				/>
			</div>
		</div>
	);
}
