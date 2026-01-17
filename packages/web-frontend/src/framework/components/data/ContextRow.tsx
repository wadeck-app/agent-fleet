import type { ReactNode } from 'react';

import { Label } from '../forms/Label';

export interface ContextRowProps {
	label: string;
	value: ReactNode;
	labelClassName?: string;
	valueClassName?: string;
	className?: string;
	showBorder?: boolean;
}

export function ContextRow({
	label,
	value,
	labelClassName = 'text-xs text-muted-foreground',
	valueClassName,
	className,
	showBorder = true,
}: ContextRowProps) {
	const borderClass = showBorder ? 'border-b' : '';

	return (
		<div className={`flex items-center justify-between py-2 ${borderClass} ${className || ''}`.trim()}>
			<Label className={labelClassName}>{label}</Label>
			<div className={valueClassName}>{value}</div>
		</div>
	);
}
