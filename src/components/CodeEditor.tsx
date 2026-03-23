import { useEffect, useRef } from "react";
import { EditorView, lineNumbers, highlightActiveLine, drawSelection, keymap } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { oneDark } from "@codemirror/theme-one-dark";
import { languages } from "@codemirror/language-data";

interface CodeEditorProps {
  content: string;
  language: string;
  readOnly?: boolean;
  darkMode?: boolean;
}

export function CodeEditor({ content, language, readOnly = true, darkMode = true }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Find language support
    const langDesc = languages.find((l) =>
      l.name.toLowerCase() === language.toLowerCase() ||
      l.alias.some((a) => a.toLowerCase() === language.toLowerCase()),
    );

    const langCompartment = new Compartment();

    const extensions = [
      lineNumbers(),
      highlightActiveLine(),
      drawSelection(),
      bracketMatching(),
      indentOnInput(),
      highlightSelectionMatches(),
      history(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      EditorView.lineWrapping,
      EditorState.readOnly.of(readOnly),
      langCompartment.of([]),
    ];

    if (darkMode) {
      extensions.push(oneDark);
    }

    // Create editor
    const state = EditorState.create({
      doc: content,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    // Load language support async
    if (langDesc) {
      void langDesc.load().then((lang) => {
        view.dispatch({
          effects: langCompartment.reconfigure(lang),
        });
      });
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [content, language, readOnly, darkMode]);

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto [&_.cm-editor]:h-full [&_.cm-scroller]:!overflow-auto"
    />
  );
}
