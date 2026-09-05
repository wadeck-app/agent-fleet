import { SearchInput } from '@framework/components/search/SearchInput';

import { usePipelineContext } from './PipelineContext';

/**
 * ===========================================================================================
 * PIPELINE SEARCH
 * ===========================================================================================
 *
 * Interactive search input for pipeline data table.
 * Calls setSearch from context -- triggers modifier override and re-fetch.
 *
 * ===========================================================================================
 */

export function PipelineSearch() {
	const { query, setSearch } = usePipelineContext();

	return (
		<SearchInput
			value={(query.search as string) ?? ''}
			onChange={setSearch}
			placeholder="Search..."
			className="flex-1"
		/>
	);
}
