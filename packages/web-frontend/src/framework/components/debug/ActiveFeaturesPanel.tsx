/**
 * ActiveFeaturesPanel Component
 *
 * Displays a debug panel showing active features and their current values.
 * Used across multiple CRUD pages to show search state, sort configs, cache info, etc.
 *
 * @example
 * ```tsx
 * <ActiveFeaturesPanel
 *   features={[
 *     { label: 'Search', value: `${search} / ${debouncedSearch}` },
 *     { label: 'Sort', value: sortConfigs.map(c => `${c.key}:${c.direction}`) },
 *     { label: 'Cache ID', value: cacheId.toString() },
 *   ]}
 * />
 * ```
 */

interface ActiveFeature {
	/**
	 * Label for the feature (e.g., "Search", "Sort", "Cache ID")
	 */
	label: string;

	/**
	 * Current value of the feature (can be string or array of strings)
	 */
	value: string | string[];
}

interface ActiveFeaturesPanelProps {
	/**
	 * Array of features to display
	 */
	features: ActiveFeature[];

	/**
	 * Title for the panel (defaults to "Active Features")
	 */
	title?: string;

	/**
	 * Additional className for customization
	 */
	className?: string;
}

export function ActiveFeaturesPanel({ features, title = 'Active Features', className = '' }: ActiveFeaturesPanelProps) {
	return (
		<div className={`mb-4 rounded-lg border border-border bg-muted/50 p-4 text-sm ${className}`.trim()}>
			<strong>{title}:</strong>
			<div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
				{features.map(({ label, value }) => (
					<div key={label}>
						<span className="text-muted-foreground">{label}:</span>{' '}
						<span className="font-mono">{Array.isArray(value) ? value.join(', ') : value}</span>
					</div>
				))}
			</div>
		</div>
	);
}
