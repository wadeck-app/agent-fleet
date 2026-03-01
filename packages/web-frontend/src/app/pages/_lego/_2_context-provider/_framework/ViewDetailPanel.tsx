import { useMemo, useState } from 'react';

import { Checkbox } from '@framework/components/forms/Checkbox';
import { Input } from '@framework/components/forms/Input';
import { Textarea } from '@framework/components/forms/Textarea';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { Card } from '@framework/components/primitives/Card';
import type { ColumnDef } from '@framework/lego/types/ColTypes';
import type { DetailPanelFeature } from '@framework/lego/types/FeatureTypes';
import { resolveFeature } from '@framework/lego/types/FeatureTypes';
import type { Product } from '@shared/api/products.contract';
import { Check, Edit, Minus, Save, X } from 'lucide-react';

import { useProductDomain } from './ProductDomainContext';

/**
 * ===========================================================================================
 * VIEW DETAIL PANEL
 * ===========================================================================================
 *
 * Detail panel view component that reads from ProductDomainContext.
 * NO service prop, NO data prop - reads everything from context.
 *
 * Features:
 * - inline-edit: Toggle between read-only and edit mode
 *
 * Reads context.selectedItem (no listens prop needed — reacts to context changes).
 * When the table calls actions.select(), this panel automatically updates.
 *
 * ===========================================================================================
 */

export interface ViewDetailPanelProps<T = Product> {
	columns: ColumnDef<T>[];
	features: DetailPanelFeature[];
}

export function ViewDetailPanel<T extends Product = Product>({ columns, features }: ViewDetailPanelProps<T>) {
	const context = useProductDomain();
	const [isEditing, setIsEditing] = useState(false);
	const [editData, setEditData] = useState<Partial<T>>({});

	/**
	 * Resolve features
	 */
	const inlineEditConfig = useMemo(
		() =>
			features.find(f => {
				const resolved = resolveFeature(f, 'inline-edit');
				return resolved !== null;
			}),
		[features]
	);

	const selectedItem = context.selectedItem as T | null;

	/**
	 * Start editing
	 */
	const handleEdit = () => {
		if (selectedItem) {
			setEditData({ ...selectedItem });
			setIsEditing(true);
		}
	};

	/**
	 * Cancel editing
	 */
	const handleCancel = () => {
		setIsEditing(false);
		setEditData({});
	};

	/**
	 * Save changes
	 */
	const handleSave = async () => {
		if (selectedItem && editData) {
			await context.actions.update(selectedItem.id, editData as any);
			setIsEditing(false);
			setEditData({});
		}
	};

	/**
	 * Update field value
	 */
	const updateField = (key: keyof T, value: any) => {
		setEditData(prev => ({ ...prev, [key]: value }));
	};

	/**
	 * Render field value based on column definition
	 */
	const renderFieldValue = (item: T, col: ColumnDef<T>) => {
		if (col.render) {
			return col.render(item);
		}

		const value = item[col.key];

		if (col.type === 'number') {
			const prefix = col.prefix ?? '';
			const suffix = col.suffix ?? '';
			return `${prefix}${Number(value).toLocaleString()}${suffix}`;
		}

		if (col.type === 'enum' && col.badge) {
			return <Badge variant="secondary">{String(value)}</Badge>;
		}

		if (col.type === 'boolean') {
			return value ? (
				<Check className="size-4 text-primary" />
			) : (
				<Minus className="size-4 text-muted-foreground" />
			);
		}

		if (col.type === 'date') {
			return value ? new Date(value as string | number | Date).toLocaleDateString() : '–';
		}

		return String(value ?? '');
	};

	/**
	 * Render editable field
	 */
	const renderEditField = (col: ColumnDef<T>) => {
		const value = editData[col.key];

		if (col.type === 'text') {
			return (
				<Input
					value={String(value ?? '')}
					onChange={e => updateField(col.key, e.target.value)}
					placeholder={col.label}
				/>
			);
		}

		if (col.type === 'number') {
			return (
				<Input
					type="number"
					value={Number(value ?? 0)}
					onChange={e => updateField(col.key, parseFloat(e.target.value) || 0)}
					placeholder={col.label}
				/>
			);
		}

		if (col.type === 'boolean') {
			return <Checkbox checked={Boolean(value)} onCheckedChange={checked => updateField(col.key, checked)} />;
		}

		if (col.key === 'description') {
			return (
				<Textarea
					value={String(value ?? '')}
					onChange={e => updateField(col.key, e.target.value)}
					placeholder={col.label}
					rows={4}
				/>
			);
		}

		return (
			<Input
				value={String(value ?? '')}
				onChange={e => updateField(col.key, e.target.value)}
				placeholder={col.label}
			/>
		);
	};

	if (!selectedItem) {
		return (
			<Card className="p-8">
				<div className="text-center text-muted-foreground">Select an item to view details</div>
			</Card>
		);
	}

	return (
		<Card className="p-6">
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<h3 className="text-lg font-semibold">Details</h3>
					{inlineEditConfig && !isEditing && (
						<Button variant="outline" size="sm" onClick={handleEdit}>
							<Edit className="mr-2 size-4" />
							Edit
						</Button>
					)}
					{inlineEditConfig && isEditing && (
						<div className="flex gap-2">
							<Button variant="outline" size="sm" onClick={handleCancel}>
								<X className="mr-2 size-4" />
								Cancel
							</Button>
							<Button variant="default" size="sm" onClick={handleSave}>
								<Save className="mr-2 size-4" />
								Save
							</Button>
						</div>
					)}
				</div>

				{columns.map(col => (
					<div key={String(col.key)} className="space-y-1">
						<span className="text-sm font-medium text-muted-foreground">{col.label}</span>
						{isEditing ? (
							<div>{renderEditField(col)}</div>
						) : (
							<div className="text-sm">{renderFieldValue(selectedItem, col)}</div>
						)}
					</div>
				))}
			</div>
		</Card>
	);
}
