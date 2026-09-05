import { useEffect, useRef, useState } from 'react';

import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { type Extension, StateEffect, StateField } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';

import type { CodeEditorProps, LineSelection } from './CodeEditorTypes';
import { getLanguageExtension } from './languageDetection';

//  Theme factory 
// Creates editor theme per mode. CSS variables handle backgrounds/foreground.
// Line number colors are hardcoded per mode to match GitHub exactly.

function createAppTheme(isDark: boolean) {
	// GitHub-exact line number colors
	const lineNumberColor = isDark ? 'f' : 'c';
	const lineNumberHover = isDark ? 'be' : 'f';
	const lineNumberActive = isDark ? 'c' : 'b';
	const activeLineBg = isDark ? 'rgba(,,,.)' : 'rgba(,,,.)';

	return EditorView.theme({
		'&': {
			height: '%',
			fontSize: 'px',
			backgroundColor: 'var(--background)',
			color: 'var(--foreground)',
		},
		'.cm-scroller': { overflow: 'auto' },

		'.cm-content': {
			caretColor: 'var(--foreground)',
			fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
		},
		'&.cm-focused .cm-cursor': {
			borderLeftColor: 'var(--foreground)',
		},
		'&.cm-focused .cm-selectionBackground, ::selection': {
			backgroundColor: 'color-mix(in srgb, var(--primary) %, transparent)',
		},
		'.cm-selectionBackground': {
			backgroundColor: 'color-mix(in srgb, var(--primary) %, transparent)',
		},

		'.cm-activeLine': {
			backgroundColor: activeLineBg,
		},

		// Gutter: seamless, line numbers clearly dimmer than code
		'.cm-gutters': {
			backgroundColor: 'var(--background)',
			color: lineNumberColor,
			border: 'none',
		},
		'.cm-lineNumbers .cm-gutterElement': {
			paddingLeft: 'px',
			paddingRight: 'px',
			cursor: 'pointer',
			minWidth: 'ch',
			transition: 'color .s',
		},
		'.cm-lineNumbers .cm-gutterElement:hover': {
			color: lineNumberHover,
		},
		'.cm-activeLineGutter': {
			backgroundColor: activeLineBg,
			color: lineNumberActive,
		},

		// Line selection highlight (GitHub-style)
		'.cm-selectedLine': {
			backgroundColor: 'color-mix(in srgb, var(--primary) %, transparent)',
		},

		// Matching brackets
		'&.cm-focused .cm-matchingBracket': {
			backgroundColor: 'color-mix(in srgb, var(--primary) %, transparent)',
			outline: 'px solid color-mix(in srgb, var(--primary) %, transparent)',
		},

		// Tooltip / autocomplete
		'.cm-tooltip': {
			backgroundColor: 'var(--popover)',
			color: 'var(--popover-foreground)',
			border: 'px solid var(--border)',
		},
	});
}

//  Syntax highlighting 
// Two palettes: GitHub-light for light mode, GitHub-dark for dark mode.

// @formatter:off
const lightHighlightStyle = HighlightStyle.define([
	{ tag: tags.keyword, color: 'cfe' },
	{ tag: tags.controlKeyword, color: 'cfe' },
	{ tag: tags.operatorKeyword, color: 'cfe' },
	{ tag: tags.definitionKeyword, color: 'cfe' },
	{ tag: tags.moduleKeyword, color: 'cfe' },

	{ tag: tags.name, color: 'f' },
	{ tag: tags.variableName, color: 'f' },
	{ tag: [tags.definition(tags.variableName)], color: '' },
	{ tag: [tags.function(tags.variableName)], color: 'df' },
	{ tag: tags.propertyName, color: 'ae' },
	{ tag: [tags.definition(tags.propertyName)], color: 'ae' },

	{ tag: tags.typeName, color: '' },
	{ tag: tags.className, color: '' },
	{ tag: tags.labelName, color: 'ae' },
	{ tag: tags.namespace, color: '' },

	{ tag: tags.string, color: 'a' },
	{ tag: tags.special(tags.string), color: 'a' },
	{ tag: tags.number, color: 'ae' },
	{ tag: tags.bool, color: 'ae' },
	{ tag: tags.null, color: 'ae' },

	{ tag: tags.comment, color: 'e', fontStyle: 'italic' },
	{ tag: tags.docComment, color: 'e', fontStyle: 'italic' },

	{ tag: tags.operator, color: 'cfe' },
	{ tag: tags.derefOperator, color: 'f' },
	{ tag: tags.punctuation, color: 'f' },
	{ tag: tags.bracket, color: 'f' },
	{ tag: tags.separator, color: 'f' },

	{ tag: tags.tagName, color: '' },
	{ tag: tags.attributeName, color: 'ae' },
	{ tag: tags.attributeValue, color: 'a' },

	{ tag: tags.meta, color: 'e' },
	{ tag: tags.processingInstruction, color: 'e' },
	{ tag: tags.heading, color: 'ae', fontWeight: 'bold' },
	{ tag: tags.emphasis, fontStyle: 'italic' },
	{ tag: tags.strong, fontWeight: 'bold' },
	{ tag: tags.link, color: 'ae', textDecoration: 'underline' },
	{ tag: tags.invalid, color: 'cfe' },
]);

const darkHighlightStyle = HighlightStyle.define([
	{ tag: tags.keyword, color: 'ffb' },
	{ tag: tags.controlKeyword, color: 'ffb' },
	{ tag: tags.operatorKeyword, color: 'ffb' },
	{ tag: tags.definitionKeyword, color: 'ffb' },
	{ tag: tags.moduleKeyword, color: 'ffb' },

	{ tag: tags.name, color: 'cdd' },
	{ tag: tags.variableName, color: 'cdd' },
	{ tag: [tags.definition(tags.variableName)], color: 'ffa' },
	{ tag: [tags.function(tags.variableName)], color: 'daff' },
	{ tag: tags.propertyName, color: 'cff' },
	{ tag: [tags.definition(tags.propertyName)], color: 'cff' },

	{ tag: tags.typeName, color: 'ffa' },
	{ tag: tags.className, color: 'ffa' },
	{ tag: tags.labelName, color: 'cff' },
	{ tag: tags.namespace, color: 'ffa' },

	{ tag: tags.string, color: 'adff' },
	{ tag: tags.special(tags.string), color: 'adff' },
	{ tag: tags.number, color: 'cff' },
	{ tag: tags.bool, color: 'cff' },
	{ tag: tags.null, color: 'cff' },

	{ tag: tags.comment, color: 'be', fontStyle: 'italic' },
	{ tag: tags.docComment, color: 'be', fontStyle: 'italic' },

	{ tag: tags.operator, color: 'ffb' },
	{ tag: tags.derefOperator, color: 'cdd' },
	{ tag: tags.punctuation, color: 'cdd' },
	{ tag: tags.bracket, color: 'cdd' },
	{ tag: tags.separator, color: 'cdd' },

	{ tag: tags.tagName, color: 'ee' },
	{ tag: tags.attributeName, color: 'cff' },
	{ tag: tags.attributeValue, color: 'adff' },

	{ tag: tags.meta, color: 'be' },
	{ tag: tags.processingInstruction, color: 'be' },
	{ tag: tags.heading, color: 'cff', fontWeight: 'bold' },
	{ tag: tags.emphasis, fontStyle: 'italic' },
	{ tag: tags.strong, fontWeight: 'bold' },
	{ tag: tags.link, color: 'adff', textDecoration: 'underline' },
	{ tag: tags.invalid, color: 'f' },
]);
// @formatter:on

//  Dark mode detection (reactive) 

function useDarkMode(): boolean {
	const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

	useEffect(() => {
		const observer = new MutationObserver(() => {
			setIsDark(document.documentElement.classList.contains('dark'));
		});
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class'],
		});
		return () => observer.disconnect();
	}, []);

	return isDark;
}

//  Line selection state management 

const setSelectedLinesEffect = StateEffect.define<LineSelection | null>();

const lineHighlightDecoration = Decoration.line({ class: 'cm-selectedLine' });

function buildLineDecorations(state: EditorState, selection: LineSelection | null): DecorationSet {
	if (!selection) return Decoration.none;
	const decorations = [];
	for (let line = selection.from; line <= selection.to; line++) {
		if (line >=  && line <= state.doc.lines) {
			decorations.push(lineHighlightDecoration.range(state.doc.line(line).from));
		}
	}
	return Decoration.set(decorations);
}

const selectedLinesField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(decorations, tr) {
		for (const effect of tr.effects) {
			if (effect.is(setSelectedLinesEffect)) {
				return buildLineDecorations(tr.state, effect.value);
			}
		}
		return decorations;
	},
	provide: f => EditorView.decorations.from(f),
});

//  Component 

/
  CodeMirror  editor implementation.
 
  Reactively adapts to light/dark mode changes (MutationObserver on <html>).
  Uses GitHub-light and GitHub-dark syntax palettes respectively.
  Line numbers use hardcoded GitHub-exact colors per mode.
 /
export function CodeMirrorEditor({
	value,
	onChange,
	language,
	readOnly = false,
	showLineNumbers = true,
	selectedLines = null,
	onLineSelect,
	className = '',
}: CodeEditorProps) {
	const editorRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	const valueRef = useRef(value);
	const onLineSelectRef = useRef(onLineSelect);
	const anchorLineRef = useRef<number | null>(null);
	const scrolledToRef = useRef<string | null>(null);
	const isUserClickRef = useRef(false);

	const isDark = useDarkMode();

	useEffect(() => {
		valueRef.current = value;
	}, [value]);

	useEffect(() => {
		onLineSelectRef.current = onLineSelect;
	}, [onLineSelect]);

	//  Editor initialisation 

	useEffect(() => {
		if (!editorRef.current) return;

		const appTheme = createAppTheme(isDark);
		const highlightStyle = isDark ? darkHighlightStyle : lightHighlightStyle;

		const extensions: Extension[] = [
			appTheme,
			syntaxHighlighting(highlightStyle, { fallback: true }),
			EditorView.lineWrapping,
			EditorState.readOnly.of(readOnly),
			selectedLinesField,
		];

		if (showLineNumbers) {
			extensions.push(
				lineNumbers({
					domEventHandlers: {
						mousedown(view, line, event) {
							if (!onLineSelectRef.current) return false;
							const lineNo = view.state.doc.lineAt(line.from).number;
							const mouseEvent = event as MouseEvent;

							isUserClickRef.current = true;
							if (mouseEvent.shiftKey && anchorLineRef.current !== null) {
								const from = Math.min(anchorLineRef.current, lineNo);
								const to = Math.max(anchorLineRef.current, lineNo);
								onLineSelectRef.current({ from, to });
							} else {
								anchorLineRef.current = lineNo;
								onLineSelectRef.current({ from: lineNo, to: lineNo });
							}
							return true;
						},
					},
				})
			);
		}

		const langExtension = getLanguageExtension(language);
		if (langExtension) {
			extensions.push(langExtension);
		}

		if (onChange) {
			extensions.push(
				EditorView.updateListener.of(update => {
					if (update.docChanged) {
						const newValue = update.state.doc.toString();
						if (newValue !== valueRef.current) {
							onChange(newValue);
						}
					}
				})
			);
		}

		const startState = EditorState.create({ doc: value, extensions });
		const view = new EditorView({ state: startState, parent: editorRef.current });
		viewRef.current = view;

		return () => {
			view.destroy();
			viewRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isDark, language, readOnly, showLineNumbers, onChange]);

	//  Sync content from prop 

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;

		const currentValue = view.state.doc.toString();
		if (currentValue !== value) {
			view.dispatch({
				changes: { from: , to: currentValue.length, insert: value },
			});
		}
	}, [value]);

	//  Sync line selection from prop 

	const selectedFrom = selectedLines?.from ?? null;
	const selectedTo = selectedLines?.to ?? null;

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;

		const selection = selectedFrom !== null && selectedTo !== null ? { from: selectedFrom, to: selectedTo } : null;

		view.dispatch({ effects: setSelectedLinesEffect.of(selection) });

		if (!selection) {
			scrolledToRef.current = null;
			return;
		}

		const key = `${selection.from}-${selection.to}`;
		if (
			!isUserClickRef.current &&
			key !== scrolledToRef.current &&
			selection.from >=  &&
			selection.from <= view.state.doc.lines
		) {
			view.dispatch({
				effects: EditorView.scrollIntoView(view.state.doc.line(selection.from).from, {
					y: 'center',
				}),
			});
			scrolledToRef.current = key;
		}

		isUserClickRef.current = false;
	}, [selectedFrom, selectedTo, value]);

	return <div ref={editorRef} className={className} />;
}
