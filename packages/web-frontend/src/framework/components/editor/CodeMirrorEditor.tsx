import { useEffect, useRef, useState } from 'react';

import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { type Extension, StateEffect, StateField } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';

import type { CodeEditorProps, LineSelection } from './CodeEditorTypes';
import { getLanguageExtension } from './languageDetection';

// ── Theme factory ─────────────────────────────────────────────────────────
// Creates editor theme per mode. CSS variables handle backgrounds/foreground.
// Line number colors are hardcoded per mode to match GitHub exactly.

function createAppTheme(isDark: boolean) {
	// GitHub-exact line number colors
	const lineNumberColor = isDark ? '#484f58' : '#636c76';
	const lineNumberHover = isDark ? '#8b949e' : '#24292f';
	const lineNumberActive = isDark ? '#636c76' : '#4b5563';
	const activeLineBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';

	return EditorView.theme({
		'&': {
			height: '100%',
			fontSize: '13px',
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
			backgroundColor: 'color-mix(in srgb, var(--primary) 25%, transparent)',
		},
		'.cm-selectionBackground': {
			backgroundColor: 'color-mix(in srgb, var(--primary) 12%, transparent)',
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
			paddingLeft: '12px',
			paddingRight: '16px',
			cursor: 'pointer',
			minWidth: '3ch',
			transition: 'color 0.15s',
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
			backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)',
		},

		// Matching brackets
		'&.cm-focused .cm-matchingBracket': {
			backgroundColor: 'color-mix(in srgb, var(--primary) 20%, transparent)',
			outline: '1px solid color-mix(in srgb, var(--primary) 40%, transparent)',
		},

		// Tooltip / autocomplete
		'.cm-tooltip': {
			backgroundColor: 'var(--popover)',
			color: 'var(--popover-foreground)',
			border: '1px solid var(--border)',
		},
	});
}

// ── Syntax highlighting ──────────────────────────────────────────────────
// Two palettes: GitHub-light for light mode, GitHub-dark for dark mode.

// @formatter:off
const lightHighlightStyle = HighlightStyle.define([
	{ tag: tags.keyword, color: '#cf222e' },
	{ tag: tags.controlKeyword, color: '#cf222e' },
	{ tag: tags.operatorKeyword, color: '#cf222e' },
	{ tag: tags.definitionKeyword, color: '#cf222e' },
	{ tag: tags.moduleKeyword, color: '#cf222e' },

	{ tag: tags.name, color: '#24292f' },
	{ tag: tags.variableName, color: '#24292f' },
	{ tag: [tags.definition(tags.variableName)], color: '#953800' },
	{ tag: [tags.function(tags.variableName)], color: '#8250df' },
	{ tag: tags.propertyName, color: '#0550ae' },
	{ tag: [tags.definition(tags.propertyName)], color: '#0550ae' },

	{ tag: tags.typeName, color: '#953800' },
	{ tag: tags.className, color: '#953800' },
	{ tag: tags.labelName, color: '#0550ae' },
	{ tag: tags.namespace, color: '#953800' },

	{ tag: tags.string, color: '#0a3069' },
	{ tag: tags.special(tags.string), color: '#0a3069' },
	{ tag: tags.number, color: '#0550ae' },
	{ tag: tags.bool, color: '#0550ae' },
	{ tag: tags.null, color: '#0550ae' },

	{ tag: tags.comment, color: '#6e7781', fontStyle: 'italic' },
	{ tag: tags.docComment, color: '#6e7781', fontStyle: 'italic' },

	{ tag: tags.operator, color: '#cf222e' },
	{ tag: tags.derefOperator, color: '#24292f' },
	{ tag: tags.punctuation, color: '#24292f' },
	{ tag: tags.bracket, color: '#24292f' },
	{ tag: tags.separator, color: '#24292f' },

	{ tag: tags.tagName, color: '#116329' },
	{ tag: tags.attributeName, color: '#0550ae' },
	{ tag: tags.attributeValue, color: '#0a3069' },

	{ tag: tags.meta, color: '#6e7781' },
	{ tag: tags.processingInstruction, color: '#6e7781' },
	{ tag: tags.heading, color: '#0550ae', fontWeight: 'bold' },
	{ tag: tags.emphasis, fontStyle: 'italic' },
	{ tag: tags.strong, fontWeight: 'bold' },
	{ tag: tags.link, color: '#0550ae', textDecoration: 'underline' },
	{ tag: tags.invalid, color: '#cf222e' },
]);

const darkHighlightStyle = HighlightStyle.define([
	{ tag: tags.keyword, color: '#ff7b72' },
	{ tag: tags.controlKeyword, color: '#ff7b72' },
	{ tag: tags.operatorKeyword, color: '#ff7b72' },
	{ tag: tags.definitionKeyword, color: '#ff7b72' },
	{ tag: tags.moduleKeyword, color: '#ff7b72' },

	{ tag: tags.name, color: '#c9d1d9' },
	{ tag: tags.variableName, color: '#c9d1d9' },
	{ tag: [tags.definition(tags.variableName)], color: '#ffa657' },
	{ tag: [tags.function(tags.variableName)], color: '#d2a8ff' },
	{ tag: tags.propertyName, color: '#79c0ff' },
	{ tag: [tags.definition(tags.propertyName)], color: '#79c0ff' },

	{ tag: tags.typeName, color: '#ffa657' },
	{ tag: tags.className, color: '#ffa657' },
	{ tag: tags.labelName, color: '#79c0ff' },
	{ tag: tags.namespace, color: '#ffa657' },

	{ tag: tags.string, color: '#a5d6ff' },
	{ tag: tags.special(tags.string), color: '#a5d6ff' },
	{ tag: tags.number, color: '#79c0ff' },
	{ tag: tags.bool, color: '#79c0ff' },
	{ tag: tags.null, color: '#79c0ff' },

	{ tag: tags.comment, color: '#8b949e', fontStyle: 'italic' },
	{ tag: tags.docComment, color: '#8b949e', fontStyle: 'italic' },

	{ tag: tags.operator, color: '#ff7b72' },
	{ tag: tags.derefOperator, color: '#c9d1d9' },
	{ tag: tags.punctuation, color: '#c9d1d9' },
	{ tag: tags.bracket, color: '#c9d1d9' },
	{ tag: tags.separator, color: '#c9d1d9' },

	{ tag: tags.tagName, color: '#7ee787' },
	{ tag: tags.attributeName, color: '#79c0ff' },
	{ tag: tags.attributeValue, color: '#a5d6ff' },

	{ tag: tags.meta, color: '#8b949e' },
	{ tag: tags.processingInstruction, color: '#8b949e' },
	{ tag: tags.heading, color: '#79c0ff', fontWeight: 'bold' },
	{ tag: tags.emphasis, fontStyle: 'italic' },
	{ tag: tags.strong, fontWeight: 'bold' },
	{ tag: tags.link, color: '#a5d6ff', textDecoration: 'underline' },
	{ tag: tags.invalid, color: '#f85149' },
]);
// @formatter:on

// ── Dark mode detection (reactive) ───────────────────────────────────────

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

// ── Line selection state management ──────────────────────────────────────

const setSelectedLinesEffect = StateEffect.define<LineSelection | null>();

const lineHighlightDecoration = Decoration.line({ class: 'cm-selectedLine' });

function buildLineDecorations(state: EditorState, selection: LineSelection | null): DecorationSet {
	if (!selection) return Decoration.none;
	const decorations = [];
	for (let line = selection.from; line <= selection.to; line++) {
		if (line >= 1 && line <= state.doc.lines) {
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

// ── Component ────────────────────────────────────────────────────────────

/**
 * CodeMirror 6 editor implementation.
 *
 * Reactively adapts to light/dark mode changes (MutationObserver on <html>).
 * Uses GitHub-light and GitHub-dark syntax palettes respectively.
 * Line numbers use hardcoded GitHub-exact colors per mode.
 */
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

	// ── Editor initialisation ────────────────────────────────────────────────

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

	// ── Sync content from prop ───────────────────────────────────────────────

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;

		const currentValue = view.state.doc.toString();
		if (currentValue !== value) {
			view.dispatch({
				changes: { from: 0, to: currentValue.length, insert: value },
			});
		}
	}, [value]);

	// ── Sync line selection from prop ────────────────────────────────────────

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
			selection.from >= 1 &&
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
