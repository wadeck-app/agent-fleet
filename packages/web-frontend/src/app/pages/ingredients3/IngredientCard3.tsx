/**
 * ===========================================================================================
 * INGREDIENT CARD3 - Single Ingredient Card Component
 * ===========================================================================================
 *
 * Displays a single ingredient as a card with all information:
 * - Header: Name and category
 * - Content: Nutritional info (calories, protein, carbs, fat) + metadata (timestamps, ID)
 * - Footer: Edit and delete actions
 *
 * Used by IngredientGrid3 to render ingredients in a grid layout.
 *
 * ===========================================================================================
 */
import type { Table2Column } from '@framework/components2/table/Table2';
import { Checkbox } from '@framework/components/forms/Checkbox';
import { Button } from '@framework/components/primitives/Button';
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@framework/components/primitives/Card';
import type { Ingredient } from '@shared/api/ingredients.contract';
import { Pencil, Trash2 } from 'lucide-react';

import { INGREDIENT_GRID_FIELDS } from './IngredientGrid3';

export interface IngredientCard3Props {
	/** The ingredient to display */
	ingredient: Ingredient;
	/** Fields to display in the card (excluding name which is always in header) */
	fields?: Table2Column<Ingredient>[];
	/** Optional edit callback */
	onEdit?: (ingredient: Ingredient) => void;
	/** Optional delete callback */
	onDelete?: (id: string) => void;
	/** Whether selection is enabled */
	selectable?: boolean;
	/** Whether this card is selected */
	isSelected?: boolean;
	/** Selection toggle callback */
	onToggleSelection?: (id: string) => void;
}

/**
 * IngredientCard3 - Single card component for displaying an ingredient
 *
 * Renders all ingredient information in a structured card layout.
 * Designed to be used in a grid layout by IngredientGrid3.
 */
export function IngredientCard3({
	ingredient,
	fields = INGREDIENT_GRID_FIELDS,
	onEdit,
	onDelete,
	selectable = false,
	isSelected = false,
	onToggleSelection,
}: IngredientCard3Props) {
	// Add comment above the target line, not at the end
	// Separate fields into main fields (first 4) and metadata fields (rest)
	const mainFields = fields.filter(f => ['calories', 'protein', 'carbs', 'fat'].includes(f.key));
	const metadataFields = fields.filter(f => !['calories', 'protein', 'carbs', 'fat', 'category'].includes(f.key));

	return (
		<Card size="default" className="hover:shadow-lg transition-shadow relative">
			{/* Selection checkbox (top right) */}
			{selectable && onToggleSelection && (
				<div className="absolute top-3 right-3 z-10">
					<Checkbox
						checked={isSelected}
						onCheckedChange={() => onToggleSelection(ingredient.id)}
						aria-label={`Select ${ingredient.name}`}
					/>
				</div>
			)}

			{/* Header: Primary info (name is always shown, category if visible) */}
			<CardHeader>
				<CardTitle>{ingredient.name}</CardTitle>
				<CardDescription>
					{fields.find(f => f.key === 'category')
						? (fields.find(f => f.key === 'category')!.render(ingredient) as string)
						: ingredient.category || 'Uncategorized'}
				</CardDescription>
			</CardHeader>

			{/* Content: Dynamic fields based on visibility/ordering */}
			<CardContent>
				{/* Main Nutritional Fields - 2x2 Grid (if any visible) */}
				{mainFields.length > 0 && (
					<div className="grid grid-cols-2 gap-3">
						{mainFields.map(field => (
							<div key={field.key} className="space-y-1">
								<div className="text-xs text-muted-foreground">{field.label}</div>
								<div className="text-lg font-semibold tabular-nums">{field.render(ingredient)}</div>
							</div>
						))}
					</div>
				)}

				{/* Metadata Fields (if any visible) */}
				{metadataFields.length > 0 && (
					<div className={`${mainFields.length > 0 ? 'mt-4 border-t pt-3' : ''} space-y-1`}>
						{metadataFields.map(field => (
							<div key={field.key} className="flex justify-between text-xs text-muted-foreground">
								<span>{field.label}:</span>
								<span className={field.key === 'id' ? 'font-mono' : ''}>
									{field.render(ingredient)}
								</span>
							</div>
						))}
					</div>
				)}
			</CardContent>

			{/* Footer: Actions */}
			{(onEdit || onDelete) && (
				<CardFooter className="gap-2">
					{onEdit && (
						<Button
							size="sm"
							variant="outline"
							onClick={() => onEdit(ingredient)}
							aria-label={`Edit ${ingredient.name}`}
							className="flex-1"
						>
							<Pencil className="mr-2 h-4 w-4" />
							Edit
						</Button>
					)}
					{onDelete && (
						<Button
							size="sm"
							variant="destructive"
							onClick={() => onDelete(ingredient.id)}
							aria-label={`Delete ${ingredient.name}`}
							className="flex-1"
						>
							<Trash2 className="mr-2 h-4 w-4" />
							Delete
						</Button>
					)}
				</CardFooter>
			)}
		</Card>
	);
}
