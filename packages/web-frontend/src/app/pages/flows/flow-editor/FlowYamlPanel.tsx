import { useState } from 'react';

import { Button } from '@framework/components/primitives/Button';
import * as yaml from 'js-yaml';
import { ChevronLeft, ChevronRight, Code } from 'lucide-react';

import type { FlowDefinition } from './types/flow-engine.types';

interface FlowYamlPanelProps {
	flowDefinition: FlowDefinition | null;
}

export function FlowYamlPanel({ flowDefinition }: FlowYamlPanelProps) {
	const [isOpen, setIsOpen] = useState(true);

	if (!flowDefinition) {
		return null;
	}

	const yamlContent = yaml.dump(flowDefinition, {
		indent: 2,
		lineWidth: 120,
		noRefs: true,
		sortKeys: false,
	});

	if (!isOpen) {
		return (
			<div className="border-l bg-card">
				<Button
					variant="ghost"
					size="sm"
					onClick={() => setIsOpen(true)}
					className="h-full w-12 flex items-center justify-center"
					title="Show YAML"
				>
					<ChevronLeft className="size-4" />
				</Button>
			</div>
		);
	}

	return (
		<div className="w-[500px] border-l bg-card flex flex-col">
			{/* Header */}
			<div className="flex items-center justify-between p-3 border-b">
				<div className="flex items-center gap-2">
					<Code className="size-4" />
					<span className="font-semibold text-sm">YAML View</span>
				</div>
				<Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
					<ChevronRight className="size-4" />
				</Button>
			</div>

			{/* YAML Content */}
			<div className="flex-1 overflow-auto p-4">
				<pre className="text-xs font-mono bg-muted p-3 rounded overflow-x-auto">
					<code>{yamlContent}</code>
				</pre>
			</div>
		</div>
	);
}
