import { Button } from '@framework/components/primitives/Button';
import { Star } from 'lucide-react';

interface RatingInputProps {
	value: number;
	onChange: (rating: number) => void;
}

export function RatingInput({ value, onChange }: RatingInputProps) {
	return (
		<div className="flex gap-1">
			{[1, 2, 3, 4, 5].map(n => (
				<Button
					key={n}
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => onChange(n)}
					className={`h-auto p-0.5 ${n <= value ? 'text-warning' : 'text-muted-foreground/30 hover:text-warning/60'}`}
					aria-label={`Rate ${n} out of 5`}
				>
					<Star className="size-6 fill-current" />
				</Button>
			))}
		</div>
	);
}
