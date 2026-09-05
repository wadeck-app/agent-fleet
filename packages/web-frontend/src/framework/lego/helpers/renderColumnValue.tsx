import type { ReactNode } from 'react';

import { Badge } from '@framework/components/primitives/Badge';
import type { ColumnDef } from '../types/ColTypes';
import { Check, X } from 'lucide-react';

/**
 * ===========================================================================================
 * RENDER COLUMN VALUE HELPER
 * ===========================================================================================
 *
 * Shared logic for rendering column values based on column type.
 * Used across all Lego table implementations to ensure consistent rendering.
 *
 * Supports:
 * - boolean: Check/X icons
 * - number: Formatted with prefix/suffix, 2 decimal places
 * - enum: Badge component or plain text
 * - date: Formatted using toLocaleDateString()
 * - text: String conversion with empty fallback
 *
 * ===========================================================================================
 */

export function renderColumnValue<T>(col: ColumnDef<T>, item: T): ReactNode {
	// Use custom render function if provided
	if (col.render) {
		return col.render(item);
	}

	const value = item[col.key];

	// Boolean type: render Check or X icon
	if (col.type === 'boolean') {
		return value ? <Check className="size-4 text-primary" /> : <X className="size-4 text-muted-foreground" />;
	}

	// Number type: format with prefix/suffix
	if (col.type === 'number' && typeof value === 'number') {
		return (
			<span>
				{col.prefix}
				{value.toFixed(2)}
				{col.suffix}
			</span>
		);
	}

	// Enum type with badge
	if (col.type === 'enum' && col.badge) {
		return <Badge variant="secondary">{String(value)}</Badge>;
	}

	// Date type: format as locale date string
	if (col.type === 'date') {
		if (value instanceof Date) {
			return value.toISOString().slice(0, 10);
		}
		if (typeof value === 'string') {
			return new Date(value).toISOString().slice(0, 10);
		}
	}

	// Default: convert to string with empty fallback
	return String(value || '');
}
