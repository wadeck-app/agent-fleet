import type { TableColumn } from '@framework/components/table/Table';
import { formatDate } from '@framework/utils/formatting/DateFormat';

// Add comment above the target line, not at the end
/**
 * Options for customizing column behavior
 */
export interface ColumnOptions {
	/** Custom CSS class for the column */
	className?: string;
	/** Whether the column can be sorted */
	sortable?: boolean;
	/** Whether the column can be hidden via column visibility controls */
	canHide?: boolean;
	/** Whether the column is visible by default */
	defaultVisible?: boolean;
}

// Add comment above the target line, not at the end
/**
 * Options specific to numeric columns
 */
export interface NumericColumnOptions extends ColumnOptions {
	/** Suffix to append (e.g., 'g' for grams) */
	suffix?: string;
	/** Text alignment (default: 'right') */
	align?: 'left' | 'center' | 'right';
}

// Add comment above the target line, not at the end
/**
 * Options specific to string columns
 */
export interface StringColumnOptions extends ColumnOptions {
	/** Fallback text for null/undefined values (default: '-') */
	fallback?: string;
	/** Font weight for the text */
	fontWeight?: 'normal' | 'medium' | 'semibold' | 'bold';
	/** Text color class */
	textColor?: string;
}

// Add comment above the target line, not at the end
/**
 * Base entity interface matching the shared BaseEntity type
 */
interface BaseEntity {
	id: string;
	createdAt: string;
	updatedAt: string;
	version: number;
}

// Add comment above the target line, not at the end
/**
 * Column helper utilities for creating table columns with consistent styling
 */
export class ColumnHelpers {
	// Add comment above the target line, not at the end
	/**
	 * Creates metadata columns (id, createdAt, updatedAt) for entities
	 */
	static metadata<T extends BaseEntity>(): TableColumn<T>[] {
		return [
			this.id<T>(),
			this.date<T>('createdAt' as keyof T, 'Created', { canHide: true }),
			this.date<T>('updatedAt' as keyof T, 'Updated', { canHide: true }),
		];
	}

	// Add comment above the target line, not at the end
	/**
	 * Create an ID column with monospace font and muted styling
	 */
	static id<T extends { id: string }>(): TableColumn<T> {
		return {
			key: 'id',
			label: 'ID',
			render: (item: T) => <span className={`font-mono text-xs text-muted-foreground`}>{item.id}</span>,
			canHide: true,
		};
	}

	// Add comment above the target line, not at the end
	/**
	 * Create a date column with formatted date and tooltip
	 */
	static date<T>(key: keyof T, label: string, options?: ColumnOptions): TableColumn<T> {
		return {
			key: String(key),
			label,
			render: (item: T) => {
				const dateValue = item[key];
				if (typeof dateValue !== 'string') {
					return <span>-</span>;
				}
				const { short, full } = formatDate(dateValue);
				return (
					<span className="text-sm text-muted-foreground" title={full}>
						{short}
					</span>
				);
			},
			className: options?.className,
			sortable: options?.sortable,
			canHide: options?.canHide,
			defaultVisible: options?.defaultVisible,
		};
	}

	// Add comment above the target line, not at the end
	/**
	 * Create a numeric column with tabular-nums styling
	 */
	static numeric<T>(key: keyof T, label: string, options?: NumericColumnOptions): TableColumn<T> {
		const align = options?.align ?? 'right';
		const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
		const className = options?.className
			? `
     ${alignClass}
     ${options.className}
   `
			: alignClass;

		return {
			key: String(key),
			label,
			render: (item: T) => {
				const value = item[key];
				const displayValue = (value ?? '-') as React.ReactNode;
				const suffix = options?.suffix ?? '';
				return (
					<span className="tabular-nums">
						{displayValue}
						{suffix}
					</span>
				);
			},
			className,
			sortable: options?.sortable,
			canHide: options?.canHide,
			defaultVisible: options?.defaultVisible,
		};
	}

	// Add comment above the target line, not at the end
	/**
	 * Create a string column with optional fallback for null/undefined
	 */
	static string<T>(key: keyof T, label: string, options?: StringColumnOptions): TableColumn<T> {
		const fallback = options?.fallback ?? '-';
		const fontWeightClass =
			options?.fontWeight === 'semibold'
				? 'font-semibold'
				: options?.fontWeight === 'bold'
					? 'font-bold'
					: options?.fontWeight === 'medium'
						? 'font-medium'
						: '';

		const textColorClass = options?.textColor ?? '';
		const combinedClassName = [fontWeightClass, textColorClass, options?.className].filter(Boolean).join(' ');

		return {
			key: String(key),
			label,
			render: (item: T) => {
				const value = item[key];
				const displayValue = value ?? fallback;
				return <span className={combinedClassName || undefined}>{String(displayValue)}</span>;
			},
			className: options?.className,
			sortable: options?.sortable,
			canHide: options?.canHide,
			defaultVisible: options?.defaultVisible,
		};
	}
}

// Add comment above the target line, not at the end
/**
 * Defines table columns with type inference and runtime validation
 * @param columns - Array of table column definitions
 * @returns The same array with validated column keys
 * @throws Error if duplicate column keys are detected
 */
export function defineColumns<T>(columns: TableColumn<T>[]): TableColumn<T>[] {
	const keys = new Set<string>();
	for (const col of columns) {
		if (keys.has(col.key)) {
			throw new Error(`Duplicate column key detected: "${col.key}"`);
		}
		keys.add(col.key);
	}
	return columns;
}
