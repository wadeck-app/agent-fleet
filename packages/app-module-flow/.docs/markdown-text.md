# flow:MarkdownText

Local dsl-lib component (`src/dsl-components`), used by the execution logs page to show a message as markdown. Stand-in for a dsl-ui Markdown node: when it ships, change `$type: flow:MarkdownText` in `execution-logs-page.yaml` and delete the component.

## Contract

- Props: `text` (string), `maxHeight` (css length: `30rem`, `400px`, `60vh`). Any other key renders a visible error.
- Library: `react-markdown` ^10 + `remark-gfm` (tables, task lists, strikethrough). No syntax highlighter.

## Safety

| Input                                                               | Result                                                    |
| ------------------------------------------------------------------- | --------------------------------------------------------- |
| Raw HTML (`<script>`, `<img onerror>`)                              | Written as text, never an element (no rehype-raw)         |
| Link `javascript:`, `data:`, `vbscript:`, `file:`, relative, anchor | Text only, not clickable (`SafeLinkTarget.ts`)            |
| Link http, https, mailto                                            | `target=_blank rel="noopener noreferrer"`                 |
| Image                                                               | Never an `<img>`: `[image: alt (url)]` as text            |
| Code fence                                                          | Plain monospace, Copy button                              |
| Over 20 000 characters                                              | First 20 000 rendered, "Show more" adds 100 000 per click |

## Logs page wiring

The route (`LogMessageDisplay.ts`) adds three fields per line: `preview` (one line, 200 characters max, the table cell), `expandable`, `markdown`.

- Expandable: messages starting with `[rendered prompt]`, any multi-line message, any message cut in the preview.
- `markdown`: a prompt as is; other messages inside a code fence so their lines are kept.
- The view sets `expansionCondition: expandable` so other rows have no chevron.

## Build

`manifest.json` `dslLib.shared` ranges must not exceed the build the app-core server serves (pinned in `manifest.test.ts`). `npm run bundle` runs tailwind (`npm run css`) then `app-core-cli package`.
