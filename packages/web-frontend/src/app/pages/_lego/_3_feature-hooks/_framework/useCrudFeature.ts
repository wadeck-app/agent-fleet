import type { ComponentType } from 'react';

import type { CrudDialogProps } from '@framework/lego/types/FeatureTypes';

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
	dialog: ComponentType<CrudDialogProps>;
}

export function useCrudFeature(dialog: ComponentType<CrudDialogProps>): CrudFeatureHook {
	return {
		type: 'crud',
		dialog,
	};
}
