import { AlertDialogWrapper } from '@framework/components/overlays/AlertDialogWrapper';
import { useToast } from '@framework/features/toast/ToastContext';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { FailedDeletion } from '@shared';

/**
 * ===========================================================================================
 * BULK DELETE WORKFLOW - Reusable Bulk Deletion Component
 * ===========================================================================================
 *
 * A domain-specific component that manages the complete workflow for bulk deletion operations.
 * Extracts common patterns from pages like BooksPage to provide a consistent, reusable solution
 * for batch processing with progress feedback.
 *
 * Key Features:
 * - Confirmation dialog using AlertDialogWrapper
 * - Batch processing with configurable batch size
 * - Progress toasts during deletion
 * - Success/failure/partial success handling
 * - Visual feedback callbacks for UI updates
 *
 * Architecture:
 * - Generic component (works with any item type with 'id' field)
 * - Encapsulates complex deletion logic
 * - Provides clean API for parent components
 * - Follows frontend architecture principles
 *
 * Pattern Extracted From:
 * - BooksPage.tsx handleBulkDelete (lines 210-290)
 * - BooksPage.tsx handleConfirmBulkDelete
 * - BooksPage.tsx AlertDialogWrapper usage (lines 432-442)
 *
 * ===========================================================================================
 */

export interface BulkDeleteWorkflowProps {
	// Dialog state
	open: boolean;
	onOpenChange: (open: boolean) => void;

	// Selection state
	selectedIds: Set<string>;
	onClear: () => void;

	// Deletion operations
	onBulkDelete: (ids: string[]) => Promise<{ deleted: string[]; failed: FailedDeletion[] }>;
	onReload: () => Promise<void>;

	// Display configuration
	itemTypeName: string; // "book", "ingredient", etc.
	batchSize?: number; // default 10

	// Visual feedback callbacks
	onDeletingChange?: (deletingIds: Set<string>) => void;
	onBulkDeletingChange?: (isDeleting: boolean) => void;
}

/**
 * BulkDeleteWorkflow Component
 *
 * Manages the complete workflow for bulk deletion:
 * 1. Shows confirmation dialog when open prop is true
 * 2. Processes deletions in configurable batches
 * 3. Shows progress toasts during processing
 * 4. Handles success/failure/partial success scenarios
 * 5. Provides visual feedback via callbacks
 *
 * Usage:
 * ```tsx
 * // In parent component:
 * const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
 *
 * // Trigger button:
 * <Button onClick={() => setShowBulkDeleteDialog(true)}>Delete</Button>
 *
 * // Workflow component:
 * <BulkDeleteWorkflow
 *   open={showBulkDeleteDialog}
 *   onOpenChange={setShowBulkDeleteDialog}
 *   selectedIds={selectedIds}
 *   onClear={() => setSelectedIds(new Set())}
 *   onBulkDelete={bulkDeleteBooks}
 *   onReload={() => loadBooks(currentParams)}
 *   itemTypeName="book"
 *   onDeletingChange={setDeletingIds}
 *   onBulkDeletingChange={setIsBulkDeleting}
 * />
 * ```
 */
export function BulkDeleteWorkflow({
	open,
	onOpenChange,
	selectedIds,
	onClear,
	onBulkDelete,
	onReload,
	itemTypeName,
	batchSize = 10,
	onDeletingChange,
	onBulkDeletingChange,
}: BulkDeleteWorkflowProps) {
	const { showToast } = useToast();

	const handleConfirm = async () => {
		const idsArray = Array.from(selectedIds);

		// STEP 1: Mark items as deleting (strike-through visual feedback + blur effect)
		if (onDeletingChange) {
			onDeletingChange(new Set(idsArray));
		}
		if (onBulkDeletingChange) {
			onBulkDeletingChange(true);
		}

		// STEP 2: Clear selection and close dialog immediately
		onClear();
		onOpenChange(false);

		// STEP 3: Split into batches
		const batches: string[][] = [];
		for (let i = 0; i < idsArray.length; i += batchSize) {
			batches.push(idsArray.slice(i, i + batchSize));
		}

		// STEP 4: Process batches sequentially
		const allDeleted: string[] = [];
		const allFailed: FailedDeletion[] = [];
		let currentBatch = 0;

		try {
			for (const batch of batches) {
				currentBatch++;

				// Show progress toast
				showToast(
					`Deleting batch ${currentBatch} of ${batches.length} (${batch.length} ${itemTypeName}(s))...`,
					'info'
				);

				// Call API for this batch
				const result = await onBulkDelete(batch);

				// Accumulate results
				allDeleted.push(...result.deleted);
				allFailed.push(...result.failed);
			}

			// STEP 5: Refresh and show results
			await onReload();

			// Clear visual feedback
			if (onDeletingChange) {
				onDeletingChange(new Set());
			}
			if (onBulkDeletingChange) {
				onBulkDeletingChange(false);
			}

			// Show appropriate toast based on results
			if (allFailed.length === 0) {
				// All succeeded
				showToast(`✓ Successfully deleted ${allDeleted.length} ${itemTypeName}(s)`, 'success');
			} else if (allDeleted.length === 0) {
				// All failed
				showToast(`✗ Failed to delete all ${allFailed.length} ${itemTypeName}(s)`, 'error');
			} else {
				// Partial success
				showToast(`Deleted ${allDeleted.length} ${itemTypeName}(s), ${allFailed.length} failed`, 'warning');
			}
		} catch (error: unknown) {
			// Network error or unexpected error
			await onReload();

			// Clear visual feedback
			if (onDeletingChange) {
				onDeletingChange(new Set());
			}
			if (onBulkDeletingChange) {
				onBulkDeletingChange(false);
			}

			showToast(getErrorMessage(error) || `Failed to delete ${itemTypeName}(s)`, 'error');
		}
	};

	return (
		<AlertDialogWrapper
			open={open}
			onOpenChange={onOpenChange}
			title={`Delete ${selectedIds.size} ${itemTypeName}(s)?`}
			description={`This action cannot be undone. ${selectedIds.size} ${itemTypeName}(s) will be permanently deleted.`}
			confirmLabel="Delete All"
			cancelLabel="Cancel"
			onConfirm={handleConfirm}
			variant="danger"
		/>
	);
}
