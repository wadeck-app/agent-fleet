/**
 * ===========================================================================================
 * MULTI SELECT MANAGER - Pure Logic Class
 * ===========================================================================================
 *
 * Manages multi-item selection logic independent of React.
 * Handles single/multi-selection, range selection with Shift+Click (Gmail-like behavior).
 *
 * Gmail-like Shift+Click behavior:
 * - Normal click: Sets anchor point and resets range end
 * - Shift+click:
 *   - If range not fully selected → select the range
 *   - If range fully selected:
 *     - If shrinking (click between anchor and last range end) → deselect from click to range end
 *     - Otherwise → deselect the entire range [anchor, click]
 *
 * ===========================================================================================
 */

export type SelectionMode = 'single' | 'multi';

export interface ToggleOptions {
	/** Shift key pressed (for range selection) */
	shiftKey?: boolean;
	/** Force select or deselect (ignore toggle) */
	force?: 'select' | 'deselect';
}

export class MultiSelectManager<T> {
	private items: T[];
	private getItemId: (item: T) => string;
	private mode: SelectionMode;

	// Selection state
	private selectedIds: Set<string>;

	// Shift+click state
	private lastSelectedIndex: number | null = null;
	private lastRangeEnd: number | null = null;

	constructor(items: T[], getItemId: (item: T) => string, mode: SelectionMode = 'multi') {
		this.items = items;
		this.getItemId = getItemId;
		this.mode = mode;
		this.selectedIds = new Set();
	}

	/**
	 * Get current selection
	 */
	getSelectedIds(): Set<string> {
		return new Set(this.selectedIds);
	}

	/**
	 * Set selection directly
	 */
	setSelectedIds(ids: Set<string>): void {
		this.selectedIds = new Set(ids);
		this.lastSelectedIndex = null;
		this.lastRangeEnd = null;
	}

	/**
	 * Set items (when items array changes)
	 */
	setItems(items: T[]): void {
		this.items = items;
	}

	/**
	 * Check if specific ID is selected
	 */
	isSelected(id: string): boolean {
		return this.selectedIds.has(id);
	}

	/**
	 * Check if all items are selected
	 */
	isAllSelected(): boolean {
		return this.items.length > 0 && this.items.every(item => this.selectedIds.has(this.getItemId(item)));
	}

	/**
	 * Check if some but not all items are selected
	 */
	isSomeSelected(): boolean {
		const visibleSelected = this.items.filter(item => this.selectedIds.has(this.getItemId(item))).length;
		return visibleSelected > 0 && visibleSelected < this.items.length;
	}

	/**
	 * Get selected count
	 */
	getSelectedCount(): number {
		return this.selectedIds.size;
	}

	/**
	 * Toggle selection of a single item with optional range selection
	 */
	toggleSelection(id: string, index: number, options?: ToggleOptions): Set<string> {
		const { shiftKey = false, force } = options || {};

		if (this.mode === 'single') {
			// Single mode: deselect others
			if (force === 'deselect' || (this.selectedIds.has(id) && force !== 'select')) {
				this.selectedIds = new Set();
				this.lastSelectedIndex = null;
			} else {
				this.selectedIds = new Set([id]);
				this.lastSelectedIndex = index;
			}
			this.lastRangeEnd = null;
			return this.getSelectedIds();
		}

		// Multi mode with range selection
		if (shiftKey && this.lastSelectedIndex !== null) {
			// Shift+Click: select or deselect range (Gmail-like behavior)
			const anchor = this.lastSelectedIndex;
			const start = Math.min(anchor, index);
			const end = Math.max(anchor, index);

			// Collect all IDs in range
			const rangeIds: string[] = [];
			for (let i = start; i <= end; i++) {
				const item = this.items[i];
				if (item) {
					rangeIds.push(this.getItemId(item));
				}
			}

			// Check if ALL items in the range are already selected
			const allSelected = rangeIds.every(rangeId => this.selectedIds.has(rangeId));

			const next = new Set(this.selectedIds);
			if (allSelected) {
				// All selected → deselecting behavior
				// Check if we're "shrinking" an existing range (Gmail behavior)
				const lastRangeEnd = this.lastRangeEnd;

				if (
					lastRangeEnd !== null &&
					((index > anchor && index < lastRangeEnd) || // Shrinking forward range
						(index < anchor && index > lastRangeEnd)) // Shrinking backward range
				) {
					// Gmail-like shrinking: keep range from anchor toward click
					// Forward (anchor < lastRangeEnd): keep [anchor, click-1], deselect [click, lastRangeEnd]
					// Backward (anchor > lastRangeEnd): keep [click, anchor], deselect [lastRangeEnd, click-1]
					if (anchor < lastRangeEnd) {
						// Forward range: deselect [click, lastRangeEnd]
						for (let i = index; i <= lastRangeEnd; i++) {
							const item = this.items[i];
							if (item) {
								next.delete(this.getItemId(item));
							}
						}
						// lastRangeEnd becomes click-1 (excluded)
						this.lastRangeEnd = index - 1;
					} else {
						// Backward range: deselect [lastRangeEnd, click-1]
						for (let i = lastRangeEnd; i < index; i++) {
							const item = this.items[i];
							if (item) {
								next.delete(this.getItemId(item));
							}
						}
						// lastRangeEnd becomes click (included)
						this.lastRangeEnd = index;
					}
				} else {
					// Normal deselection: deselect the range
					rangeIds.forEach(rangeId => next.delete(rangeId));
					this.lastRangeEnd = null;
				}
			} else {
				// Select the range
				rangeIds.forEach(rangeId => next.add(rangeId));
				// Remember this end for potential shrinking
				this.lastRangeEnd = index;
			}
			this.selectedIds = next;
			// Don't update lastSelectedIndex on Shift+Click to maintain the anchor point
		} else {
			// Normal click: toggle single item
			const next = new Set(this.selectedIds);

			if (force === 'select') {
				next.add(id);
			} else if (force === 'deselect') {
				next.delete(id);
			} else {
				// Toggle
				if (next.has(id)) {
					next.delete(id);
				} else {
					next.add(id);
				}
			}

			this.selectedIds = next;
			this.lastSelectedIndex = index;
			this.lastRangeEnd = null; // Reset range end on normal click
		}

		return this.getSelectedIds();
	}

	/**
	 * Select all items in current view
	 */
	selectAll(): Set<string> {
		this.selectedIds = new Set(this.items.map(this.getItemId));
		this.lastSelectedIndex = null;
		this.lastRangeEnd = null;
		return this.getSelectedIds();
	}

	/**
	 * Deselect all items
	 */
	deselectAll(): Set<string> {
		this.selectedIds = new Set();
		this.lastSelectedIndex = null;
		this.lastRangeEnd = null;
		return this.getSelectedIds();
	}

	/**
	 * Toggle between select all and deselect all
	 */
	toggleAll(): Set<string> {
		if (this.selectedIds.size > 0) {
			return this.deselectAll();
		} else {
			return this.selectAll();
		}
	}
}
