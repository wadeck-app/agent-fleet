import type { Product } from '@shared/api/products.contract';
import { Star } from 'lucide-react';

import { PipelineBody } from '../_framework/PipelineBody';
import { PipelineContent } from '../_framework/PipelineContent';
import { usePipelineContext } from '../_framework/PipelineContext';
import { PipelineSearch } from '../_framework/PipelineSearch';
import { PipelineToolbar } from '../_framework/PipelineToolbar';

export function SForkFeatContent({ bookmarks }: { bookmarks: Set<string> }) {
	const { items } = usePipelineContext<Product>();

	const bookmarkCount = Array.from(items).filter(item => bookmarks.has(item.id)).length;

	return (
		<PipelineContent>
			<PipelineToolbar>
				<PipelineSearch />
				<div className="flex items-center gap-2">
					<span className="text-sm text-muted-foreground">
						<Star className="inline-block size-4" /> {bookmarkCount} bookmarked
					</span>
				</div>
			</PipelineToolbar>
			<PipelineBody showPagination />
		</PipelineContent>
	);
}
