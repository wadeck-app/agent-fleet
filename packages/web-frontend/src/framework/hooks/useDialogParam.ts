import { useCallback, useMemo } from 'react';

import { useUrlState } from './useUrlState';

/**
 * Thin wrapper around useUrlState for dialog open/close state synced with URL.
 *
 * Only one dialog can be open at a time (correct for modals).
 * URL result: ?dialog=create-workspace → dialog opens. On refresh, param persists → dialog re-opens.
 *
 * @param dialogName - Unique identifier for this dialog (e.g., 'create-workspace')
 */
export function useDialogParam(dialogName: string) {
	const [value, setValue] = useUrlState<string | null>({
		key: 'dialog',
		defaultValue: null,
		serialize: (v: string | null) => v ?? '',
		deserialize: (v: string) => (v === '' ? null : v),
	});

	const isOpen = value === dialogName;

	const open = useCallback(() => {
		setValue(dialogName);
	}, [setValue, dialogName]);

	const close = useCallback(() => {
		setValue(null);
	}, [setValue]);

	const onOpenChange = useCallback(
		(nextOpen: boolean) => {
			if (nextOpen) {
				setValue(dialogName);
			} else {
				setValue(null);
			}
		},
		[setValue, dialogName]
	);

	return useMemo(() => ({ isOpen, open, close, onOpenChange }), [isOpen, open, close, onOpenChange]);
}
