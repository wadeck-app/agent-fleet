import type { ComponentType } from 'react';

/**
 * ===========================================================================================
 * USE CRUD FEATURE - CRUD Operations Feature Hook
 * ===========================================================================================
 *
 * React hook that provides CRUD operations feature for data tables.
 * Accepts a dialog component that will be used for create/edit operations.
 *
 * Usage:
 * ```tsx
 * const crud = useCrudFeature(ProductDialog);
 * <HookDataTable features={[crud, ...]} />
 * ```
 *
 * ===========================================================================================
 */

export interface CrudFeatureHook {
	type: 'crud';
	dialog: ComponentType<{ item: any; onSave: (data: unknown) => Promise<void>; onClose: () => void }>;
}

export function useCrudFeature(
	dialog: ComponentType<{ item: any; onSave: (data: unknown) => Promise<void>; onClose: () => void }>
): CrudFeatureHook {
	return {
		type: 'crud',
		dialog,
	};
}
