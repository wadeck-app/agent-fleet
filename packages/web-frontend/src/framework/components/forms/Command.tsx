'use client';

import * as React from 'react';

import { cn } from '@framework/lib/utils';
import { Command as CommandPrimitive } from 'cmdk';
import { SearchIcon } from 'lucide-react';

const Command = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
	<CommandPrimitive
		ref={ref}
		className={cn(
			`
     flex h-full w-full flex-col overflow-hidden rounded-md bg-popover
     text-popover-foreground
   `,
			className
		)}
		{...props}
	/>
));
Command.displayName = CommandPrimitive.displayName;

const CommandInput = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive.Input>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
	<div className="flex items-center border-b px-3" cmdk-input-wrapper="">
		<SearchIcon className="mr-2 h-4 w-4 shrink-0 opacity-50" />
		<CommandPrimitive.Input
			ref={ref}
			className={cn(
				`
      flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none
      placeholder:text-muted-foreground
      disabled:cursor-not-allowed disabled:opacity-50
    `,
				className
			)}
			{...props}
		/>
	</div>
));

CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive.List>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => {
	const listRef = React.useRef<HTMLDivElement>(null);

	// Combine refs
	React.useImperativeHandle(ref, () => listRef.current as HTMLDivElement);

	// Handle wheel events to enable scrolling with mouse wheel
	const handleWheel = React.useCallback((e: React.WheelEvent) => {
		if (listRef.current) {
			e.stopPropagation();
			listRef.current.scrollTop += e.deltaY;
		}
	}, []);

	return (
		<CommandPrimitive.List
			ref={listRef}
			className={cn('max-h-[300px] overflow-x-hidden !overflow-y-auto p-1', className)}
			style={{ maxHeight: '300px', overflowY: 'auto' }}
			onWheel={handleWheel}
			{...props}
		/>
	);
});

CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive.Empty>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => <CommandPrimitive.Empty ref={ref} className={`py-6 text-center text-sm`} {...props} />);

CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive.Group>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
	<CommandPrimitive.Group
		ref={ref}
		className={cn(
			`
     p-1 text-foreground
     [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5
     [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium
     [&_[cmdk-group-heading]]:text-muted-foreground
   `,
			className
		)}
		{...props}
	/>
));

CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandItem = React.forwardRef<
	React.ElementRef<typeof CommandPrimitive.Item>,
	React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
	<CommandPrimitive.Item
		ref={ref}
		className={cn(
			`
     relative flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm
     outline-none select-none
     aria-selected:bg-accent aria-selected:text-accent-foreground
     data-[disabled=true]:pointer-events-none
     data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50
   `,
			className
		)}
		{...props}
	/>
));

CommandItem.displayName = CommandPrimitive.Item.displayName;

export { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem };
