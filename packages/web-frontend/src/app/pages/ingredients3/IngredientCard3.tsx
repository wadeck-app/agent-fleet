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
import { Button } from '@framework/components/primitives/Button';
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@framework/components/primitives/Card';
import { formatDate } from '@framework/utils/formatting/DateFormat';
import type { Ingredient } from '@shared/api/ingredients.contract';
import { Pencil, Trash2 } from 'lucide-react';

export interface IngredientCard3Props {
	/** The ingredient to display */
	ingredient: Ingredient;
	/** Optional edit callback */
	onEdit?: (ingredient: Ingredient) => void;
	/** Optional delete callback */
	onDelete?: (id: string) => void;
}

/**
 * IngredientCard3 - Single card component for displaying an ingredient
 *
 * Renders all ingredient information in a structured card layout.
 * Designed to be used in a grid layout by IngredientGrid3.
 */
export function IngredientCard3({ ingredient, onEdit, onDelete }: IngredientCard3Props) {
	return (
		<Card size="default" className="hover:shadow-lg transition-shadow">
			{/* Header: Primary info */}
			<CardHeader>
				<CardTitle>{ingredient.name}</CardTitle>
				<CardDescription>{ingredient.category || 'Uncategorized'}</CardDescription>
			</CardHeader>

			{/* Content: Nutritional data + metadata */}
			<CardContent>
				{/* Nutritional Info - 2x2 Grid */}
				<div className="grid grid-cols-2 gap-3">
					<div className="space-y-1">
						<div className="text-xs text-muted-foreground">Calories</div>
						<div className="text-lg font-semibold tabular-nums">{ingredient.calories}</div>
					</div>
					<div className="space-y-1">
						<div className="text-xs text-muted-foreground">Protein</div>
						<div className="text-lg font-semibold tabular-nums">{ingredient.protein}g</div>
					</div>
					<div className="space-y-1">
						<div className="text-xs text-muted-foreground">Carbs</div>
						<div className="text-lg font-semibold tabular-nums">{ingredient.carbs}g</div>
					</div>
					<div className="space-y-1">
						<div className="text-xs text-muted-foreground">Fat</div>
						<div className="text-lg font-semibold tabular-nums">{ingredient.fat}g</div>
					</div>
				</div>

				{/* Metadata - Timestamps + ID */}
				<div className="mt-4 space-y-1 border-t pt-3">
					<div className="flex justify-between text-xs text-muted-foreground">
						<span>Created:</span>
						<span title={formatDate(ingredient.createdAt).full}>
							{formatDate(ingredient.createdAt).short}
						</span>
					</div>
					<div className="flex justify-between text-xs text-muted-foreground">
						<span>Updated:</span>
						<span title={formatDate(ingredient.updatedAt).full}>
							{formatDate(ingredient.updatedAt).short}
						</span>
					</div>
					<div className="flex justify-between text-xs text-muted-foreground">
						<span>ID:</span>
						<span className="font-mono">{ingredient.id}</span>
					</div>
				</div>
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
