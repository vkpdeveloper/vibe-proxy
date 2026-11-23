import { useMemo, type Ref } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  keymap,
  scrollPastEnd,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { usePhone } from '@/components/layout/pageBar';

type ConfigSourceEditorProps = {
  value: string;
  onChange: (value: string) => void;
  editorRef?: Ref<ReactCodeMirrorRef>;
  editable: boolean;
  placeholder: string;
};

// The app's black palette, read from the theme tokens so the editor follows them.
const editorTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: 'transparent',
      color: 'var(--foreground)',
      fontSize: '12.5px',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      fontFamily: 'var(--font-mono)',
      lineHeight: '1.65',
    },
    '.cm-content': { caretColor: 'var(--primary)', padding: '12px 0' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--primary)' },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--faint)',
      border: 'none',
      paddingLeft: '8px',
    },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--muted-foreground)' },
    '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--foreground) 4%, transparent)' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection':
      { backgroundColor: 'color-mix(in srgb, var(--primary) 30%, transparent)' },
    '.cm-selectionMatch': {
      backgroundColor: 'color-mix(in srgb, var(--primary) 16%, transparent)',
    },
    '.cm-searchMatch': {
      backgroundColor: 'color-mix(in srgb, var(--warning) 22%, transparent)',
      outline: 'none',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'color-mix(in srgb, var(--warning) 45%, transparent)',
    },
    '.cm-matchingBracket, .cm-nonmatchingBracket': {
      backgroundColor: 'color-mix(in srgb, var(--foreground) 10%, transparent)',
      outline: 'none',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'var(--muted)',
      border: '1px solid var(--border)',
      color: 'var(--muted-foreground)',
    },
    '.cm-placeholder': { color: 'var(--faint)' },
    '.cm-panels': {
      backgroundColor: 'var(--popover)',
      color: 'var(--foreground)',
      fontFamily: 'var(--font-sans)',
    },
    '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
    '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--border)' },
    '.cm-panel.cm-search input, .cm-panel.cm-search button': {
      borderRadius: '6px',
      border: '1px solid var(--input)',
      backgroundColor: 'transparent',
      color: 'inherit',
      backgroundImage: 'none',
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--popover)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
    },
  },
  { dark: true }
);

const highlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [tags.propertyName, tags.definition(tags.propertyName)], color: 'var(--primary)' },
    { tag: [tags.string, tags.special(tags.string)], color: 'var(--success)' },
    { tag: [tags.number, tags.bool, tags.null, tags.atom], color: 'var(--warning)' },
    { tag: [tags.comment, tags.lineComment], color: 'var(--faint)', fontStyle: 'italic' },
    {
      tag: [tags.punctuation, tags.separator, tags.squareBracket, tags.brace],
      color: 'var(--muted-foreground)',
    },
    { tag: [tags.keyword, tags.labelName, tags.typeName], color: 'var(--destructive)' },
    { tag: tags.meta, color: 'var(--muted-foreground)' },
  ])
);

/** Wrapped rows line up two characters past the line's own indent, so a wrapped value reads as one. */
function hangingIndents(view: EditorView): DecorationSet {
  const ranges = [];
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = view.state.doc.lineAt(pos);
      const hang = line.text.length - line.text.trimStart().length + 2;
      ranges.push(
        Decoration.line({
          // 6px is CodeMirror's own line padding.
          attributes: { style: `padding-left: calc(${hang}ch + 6px); text-indent: -${hang}ch` },
        }).range(line.from)
      );
      pos = line.to + 1;
    }
  }
  return Decoration.set(ranges);
}

// 16px text so iOS doesn't zoom in on focus, right padding so wrapped lines don't run to the
// screen edge, and a slim gutter (smaller numbers, no fold column) to leave room for the text.
// The extra class in each selector outranks the base theme.
const phoneTheme = EditorView.theme({
  '&.cm-editor': { fontSize: '16px' },
  '.cm-scroller .cm-content': { paddingRight: '16px' },
  '.cm-scroller .cm-gutters': { paddingLeft: '4px' },
  // The line height matches the 16px text so the smaller numbers stay on its baseline.
  '.cm-gutters .cm-lineNumbers .cm-gutterElement': {
    fontSize: '13px',
    lineHeight: `${16 * 1.65}px`,
    padding: '0 6px 0 2px',
  },
});

const hangingIndent = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = hangingIndents(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = hangingIndents(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations }
);

export default function ConfigSourceEditor({
  value,
  onChange,
  editorRef,
  editable,
  placeholder,
}: ConfigSourceEditorProps) {
  const phone = usePhone();
  const extensions = useMemo(
    () => [
      yaml(),
      editorTheme,
      highlight,
      search(),
      highlightSelectionMatches(),
      keymap.of(searchKeymap),
      // Lets the last lines scroll clear of the floating save bar.
      scrollPastEnd(),
      // Phones are too narrow for long values; wrap instead of clipping them off the edge.
      ...(phone ? [EditorView.lineWrapping, hangingIndent, phoneTheme] : []),
    ],
    [phone]
  );

  return (
    <CodeMirror
      ref={editorRef}
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme="none"
      editable={editable}
      placeholder={placeholder}
      height="100%"
      style={{ height: '100%' }}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLineGutter: true,
        highlightActiveLine: true,
        foldGutter: !phone,
        dropCursor: true,
        allowMultipleSelections: true,
        indentOnInput: true,
        bracketMatching: true,
        closeBrackets: true,
        autocompletion: false,
        rectangularSelection: true,
        crosshairCursor: false,
        highlightSelectionMatches: true,
        closeBracketsKeymap: true,
        searchKeymap: true,
        foldKeymap: true,
        completionKeymap: false,
        lintKeymap: true,
      }}
    />
  );
}
