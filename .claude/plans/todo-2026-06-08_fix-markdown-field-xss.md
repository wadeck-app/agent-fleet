# Fix XSS in MarkdownField preview

**Status:** todo  
**Priority:** high — potential stored XSS via server-supplied flow default values

## Problem

`MarkdownField.tsx` renders a preview via a custom regex parser that does **not escape HTML**
in capture groups, then injects the result via `dangerouslySetInnerHTML`. Example payload:

```
**<img onerror=alert(1)>**
```

Produces:

```html
<strong><img onerror="alert(1)" /></strong>
```

The `onerror` handler executes in the browser.

### Attack surface

`MarkdownField` is used in `CreateTaskDialog.tsx` to render `inputDef.default` — a value
that comes from the flow definition fetched from the server. If a flow definition is
imported from an external or untrusted source, this path is exploitable.

## Fix

Replace `renderMarkdownPreview` + `dangerouslySetInnerHTML` with `<ReactMarkdown>` from
`react-markdown` (already a project dependency — see `TicketCommentsSection.tsx` for the
usage pattern). ReactMarkdown renders via React components, never innerHTML — no DOMPurify
needed.

### Steps

1. Add `import ReactMarkdown from 'react-markdown'` and `import remarkGfm from 'remark-gfm'`
2. Replace the `{showPreview ? <div dangerouslySetInnerHTML=... /> : ...}` block with
   `<ReactMarkdown remarkPlugins={[remarkGfm]} components={...}>{value}</ReactMarkdown>`
3. Define Tailwind component overrides matching the existing heading/code styles (or reuse
   the `MARKDOWN_COMPONENTS` constant from `TicketCommentsSection.tsx`)
4. Delete `renderMarkdownPreview` entirely
5. Verify in the Create Task dialog that the preview renders correctly for headings, bold,
   italic, inline code, and that `**<img onerror=alert(1)>**` is rendered as text, not executed

## File to change

`packages/web-frontend/src/framework/features/forms/fields/MarkdownField.tsx`
