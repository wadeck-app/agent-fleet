const NAME_CLASS = 'break-all font-mono text-xs text-muted';

/** Name / text pairs, the name in monospace. */
export function NamedList({ items }: { items: { name: string; text: string }[] }) {
	return (
		<dl className="mt-1 flex flex-col gap-1">
			{items.map(item => (
				<div key={item.name}>
					<dt className={NAME_CLASS}>{item.name}</dt>
					<dd className="break-words">{item.text}</dd>
				</div>
			))}
		</dl>
	);
}
