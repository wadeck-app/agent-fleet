export interface LineSelection {
	from: number;
	to: number;
}

export interface CodeEditorProps {
	value: string;
	onChange?: (value: string) => void;
	language?: string;
	readOnly?: boolean;
	showLineNumbers?: boolean;
	selectedLines?: LineSelection | null;
	onLineSelect?: (selection: LineSelection) => void;
	className?: string;
}
