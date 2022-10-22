// https://www.codiga.io/blog/implement-codemirror-6-in-react/
// https://app.codiga.io/hub/snippet/8008/useCodeMirror
import React, { useCallback, useEffect, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap} from "@codemirror/view";
import { Extension, Compartment } from "@codemirror/state";
import { graffiticode } from "@graffiticode/lang-graffiticode";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { defaultKeymap } from "@codemirror/commands";
import {tags} from "@lezer/highlight";
const myHighlightStyle = HighlightStyle.define([
  {tag: tags.keyword, color: "#fc6"},
  {tag: tags.comment, color: "#f5d", fontStyle: "italic"}
]);

export default function useCodeMirror(extensions) {
  const [element, setElement] = useState();
  const ref = useCallback((node) => {
    if (!node) return;
    setElement(node);
  }, []);

  useEffect(() => {
    if (!element) {
      return undefined;
    }

    const theme = EditorView.theme({
      "&": {height: "300px"},
      ".cm-scroller": {overflow: "auto"},
      "class": "mx-4",
    });

    const startState = EditorState.create({
      doc: "..",
      extensions: [
        ...extensions,
        keymap.of(defaultKeymap),
        theme,
        graffiticode(),
        syntaxHighlighting(myHighlightStyle),
      ]
    });

    let view = new EditorView({
      state: startState,
      parent: element,
    });
    
    return () => view.destroy();    
  }, [element]);

  return { ref };
}


