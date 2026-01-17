import type { ReactNode } from 'react';

export interface MetricItemProps {
	icon: ReactNode;
	label: string;
	value: ReactNode;
	iconClassName?: string;
	labelClassName?: string;
	valueClassName?: string;
	className?: string;
}

export function MetricItem({
	icon,
	label,
	value,
	iconClassName = 'size-5 text-muted-foreground',
	labelClassName = 'text-sm text-muted-foreground',
	valueClassName = 'text-base font-medium',
	className,
}: MetricItemProps) {
	return (
		<div className={className}>
			<div className="flex items-center gap-3">
				<div className={iconClassName}>{icon}</div>
				<div className="flex flex-col gap-1">
					<span className={labelClassName}>{label}</span>
					<div className={valueClassName}>{value}</div>
				</div>
			</div>
		</div>
	);
}
