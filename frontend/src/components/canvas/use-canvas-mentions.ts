"use client";

/**
 * Detects "@" / "#" / "$" while typing inside Excalidraw's own in-canvas text
 * editor and lets the caller bind the element being edited to a task, status
 * bucket, or member respectively.
 *
 * Excalidraw's text tool renders a real `<textarea class="excalidraw-wysiwyg">`
 * into the DOM (not a canvas-only/shadow-DOM widget) and tears it down when
 * editing ends — a MutationObserver on document.body reliably catches both,
 * including the ordinary case of the user clicking away (that blurs the
 * textarea, which Excalidraw itself reacts to by committing and removing it,
 * so no separate click-away handling is needed here).
 * `appState.editingTextElement.id` (from the Excalidraw imperative API) tells
 * us exactly which scene element is being edited, with no guessing.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export type MentionTrigger = "@" | "#" | "$";

export interface MentionSelection {
  id: string;
  label: string;
}

interface MentionState {
  trigger: MentionTrigger;
  query: string;
  start: number;
  top: number;
  left: number;
}

const TEXTAREA_CLASS = "excalidraw-wysiwyg";
const TRIGGERS: MentionTrigger[] = ["@", "#", "$"];
// Query stops at whitespace or another trigger char; \S keeps it Unicode-safe
// (a plain \w would silently truncate a query containing non-ASCII names).
const TRIGGER_RE = /([@#$])([^\s@#$]*)$/;

export function useCanvasMentions(
  excalidrawAPI: ExcalidrawImperativeAPI | null,
  onLink: (elementId: string, trigger: MentionTrigger, selection: MentionSelection) => void,
) {
  const [mention, setMention] = useState<MentionState | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!excalidrawAPI) return;

    const handleInput = (e: Event) => {
      const ta = e.currentTarget as HTMLTextAreaElement;
      const cursor = ta.selectionStart ?? ta.value.length;
      const before = ta.value.slice(0, cursor);
      const match = before.match(TRIGGER_RE);
      if (!match || !TRIGGERS.includes(match[1] as MentionTrigger)) {
        setMention(null);
        return;
      }
      const rect = ta.getBoundingClientRect();
      setMention({
        trigger: match[1] as MentionTrigger,
        query: match[2],
        start: cursor - match[0].length,
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
      });
    };

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMention(null);
    };

    const attach = (ta: HTMLTextAreaElement) => {
      textareaRef.current = ta;
      ta.addEventListener("input", handleInput);
      ta.addEventListener("keydown", handleKeydown);
    };
    const detach = (ta: HTMLTextAreaElement) => {
      ta.removeEventListener("input", handleInput);
      ta.removeEventListener("keydown", handleKeydown);
      if (textareaRef.current === ta) textareaRef.current = null;
      setMention(null);
    };

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (
            node instanceof HTMLTextAreaElement &&
            node.classList.contains(TEXTAREA_CLASS)
          ) {
            attach(node);
          }
        });
        m.removedNodes.forEach((node) => {
          if (
            node instanceof HTMLTextAreaElement &&
            node.classList.contains(TEXTAREA_CLASS)
          ) {
            detach(node);
          }
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (textareaRef.current) detach(textareaRef.current);
    };
  }, [excalidrawAPI]);

  const select = useCallback(
    (selection: MentionSelection) => {
      const ta = textareaRef.current;
      if (!ta || !mention) return;

      const before = ta.value.slice(0, mention.start);
      const after = ta.value.slice(mention.start + 1 + mention.query.length);
      ta.value = `${before}${mention.trigger}${selection.label} ${after}`;
      ta.selectionStart = ta.selectionEnd = ta.value.length - after.length;
      ta.dispatchEvent(new Event("input", { bubbles: true }));

      const editingId = excalidrawAPI?.getAppState().editingTextElement?.id;
      if (editingId) onLink(editingId, mention.trigger, selection);

      setMention(null);
      ta.focus();
    },
    [mention, excalidrawAPI, onLink],
  );

  const dismiss = useCallback(() => setMention(null), []);

  return { mention, select, dismiss };
}
