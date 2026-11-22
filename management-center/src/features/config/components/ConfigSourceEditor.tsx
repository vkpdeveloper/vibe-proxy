import { useMemo, type Ref } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { EditorView, keymap, scrollPastEnd } from '@codemirror/view';
import { tags } from '@lezer/highlight';

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

export default function ConfigSourceEditor({
  value,
  onChange,
  editorRef,
  editable,
  placeholder,
}: ConfigSourceEditorProps) {
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
    ],
    []
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
        foldGutter: true,
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
