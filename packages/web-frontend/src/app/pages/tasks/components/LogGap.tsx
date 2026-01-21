import { useState } from 'react';

import { Button } from '@framework/components/primitives/Button';
import { RefreshCw } from 'lucide-react';

import type { SequenceGap } from '../hooks/useTaskLogs';

interface LogGapProps {
	gap: SequenceGap;
	onFetchGap: (gap: SequenceGap) => Promise<void>;
}

/**
 * Visual indicator for missing logs in the sequence
 * Appears when logs arrive out of order or are delayed
 */
export function LogGap({ gap, onFetchGap }: LogGapProps) {
	const [isLoading, setIsLoading] = useState(false);

	const handleFetchGap = async () => {
		setIsLoading(true);
		try {
			await onFetchGap(gap);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div
			className={`
     flex items-center justify-center gap-2 border-b border-dashed
     border-muted-foreground/30 bg-muted/30 px-4 py-1.5 font-mono text-xs
   `}
			data-gap-after={gap.afterSequence}
			data-gap-before={gap.beforeSequence}
		>
			<span className="text-muted-foreground">⋯</span>
			<span className="text-muted-foreground/70">
				{gap.missingCount} {gap.missingCount === 1 ? 'step' : 'steps'} manquant{gap.missingCount > 1 ? 's' : ''}
			</span>
			<Button
				variant="ghost"
				size="sm"
				onClick={handleFetchGap}
				disabled={isLoading}
				className={`
      h-5 gap-1 text-xs text-muted-foreground
      hover:text-foreground
    `}
				title="Fetch missing logs in this gap"
			>
				<RefreshCw className={`size-3 ${isLoading ? 'animate-spin' : ''}`} />
				{isLoading ? 'Chargement...' : 'Actualiser'}
			</Button>
		</div>
	);
}
