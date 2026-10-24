import { CappedBlock } from './CappedBlock.js';
import type { ValueBlock } from './StepIODetails.js';

/** Recorded or captured values, each in a monospace block with its copy button and its truncation note. */
export function ValueBlocks({ blocks, heightClass }: { blocks: ValueBlock[]; heightClass: string }) {
	return (
		<>
			{blocks.map(block => (
				<CappedBlock
					key={block.title}
					title={block.title}
					capped={block.capped}
					note={block.note}
					heightClass={heightClass}
				/>
			))}
		</>
	);
}
