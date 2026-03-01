import { useEffect, useState } from 'react';

import { Input } from '@framework/components/forms/Input';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import type { ColumnDef } from '@framework/lego';
import { Check, Edit, Save, X } from 'lucide-react';

/**
 * ===========================================================================================
 * HOOK DETAIL PANEL - Hook-Based Detail Panel Widget
 * ===========================================================================================
 *
 * Detail panel widget that displays a single item's details.
 * Receives selected item ID via prop instead of event bus.
 *
 * ===========================================================================================
 */

export interface HookDetailPanelProps<T> {
	service: {
		getProduct: (id: string) => Promise<T>;
		updateProduct?: (id: string, data: any) => Promise<any>;
	};
	columns: ColumnDef<T>[];
	selectedId?: string;
}

export function HookDetailPanel<T extends { id: string }>({ service, columns, selectedId }: HookDetailPanelProps<T>) {
	const [item, setItem] = useState<T | null>(null);
	const [loading, setLoading] = useState(false);
	const [editingField, setEditingField] = useState<string | null>(null);
	const [editValue, setEditValue] = useState<string>('');

	useEffect(() => {
		if (!selectedId) {
			setItem(null);
			return;
		}

		const fetchItem = async () => {
			setLoading(true);
			try {
				const data = await service.getProduct(selectedId);
				setItem(data);
			} catch (error) {
				console.error('Failed to fetch item:', error);
			} finally {
				setLoading(false);
			}
		};

		fetchItem();
	}, [selectedId, service]);

	const handleEdit = (key: string, currentValue: any) => {
		setEditingField(key);
		setEditValue(String(currentValue || ''));
	};

	const handleSave = async (key: string) => {
		if (!item || !service.updateProduct) return;

		try {
			const updatedData = { ...item, [key]: editValue };
			await service.updateProduct(item.id, updatedData);
			setItem(updatedData as T);
			setEditingField(null);
		} catch (error) {
			console.error('Failed to update item:', error);
		}
	};

	const handleCancel = () => {
		setEditingField(null);
		setEditValue('');
	};

	const getFieldValue = (item: T, key: string | number | symbol): any => {
		return item[key as keyof T];
	};

	return (
		<div className="flex h-full flex-col gap-4 rounded-lg border border-border bg-card p-4">
			<h2 className="text-lg font-semibold">Product Details</h2>

			{loading && <div className="p-8 text-center">Loading...</div>}

			{!loading && !item && (
				<div className="p-8 text-center text-muted-foreground">Select an item to view details</div>
			)}

			{!loading && item && (
				<div className="space-y-4">
					{columns.map(col => {
						const value = getFieldValue(item, col.key);
						const isEditing = editingField === col.key;

						return (
							<div key={col.key as string} className="flex items-start justify-between gap-2">
								<div className="flex-1">
									<div className="text-sm font-semibold text-muted-foreground">{col.label}</div>
									{isEditing ? (
										<Input
											type="text"
											value={editValue}
											onChange={e => setEditValue(e.target.value)}
											className="mt-1 w-full rounded border border-border bg-background px-2 py-1"
										/>
									) : (
										<div className="mt-1">
											{col.type === 'boolean' ? (
												value ? (
													<Check className="size-4 text-primary" />
												) : (
													<X className="size-4 text-muted-foreground" />
												)
											) : col.type === 'enum' && col.badge ? (
												<Badge variant="secondary">{String(value)}</Badge>
											) : (
												<span>{String(value || '')}</span>
											)}
										</div>
									)}
								</div>
								{service.updateProduct && (
									<div className="flex gap-1">
										{isEditing ? (
											<>
												<Button
													onClick={() => handleSave(col.key as string)}
													size="sm"
													variant="ghost"
												>
													<Save className="size-3" />
												</Button>
												<Button onClick={handleCancel} size="sm" variant="ghost">
													<X className="size-3" />
												</Button>
											</>
										) : (
											<Button
												onClick={() => handleEdit(col.key as string, value)}
												size="sm"
												variant="ghost"
											>
												<Edit className="size-3" />
											</Button>
										)}
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
