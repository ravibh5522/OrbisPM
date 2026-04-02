"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import type { Editor as TinyMCEEditor } from "tinymce";

const Editor = dynamic(
  () => import("@tinymce/tinymce-react").then((mod) => ({ default: mod.Editor })),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 animate-pulse bg-base-200 rounded-lg" />
    ),
  }
);

/**
 * Merge tags available in every email template.
 * Maps directly to the Jinja2 `{{ variable }}` syntax used by the email-service.
 */
const MERGE_TAGS = [
  {
    title: "General",
    menu: [
      { title: "App Name", value: "{{app_name}}" },
      { title: "App URL", value: "{{frontend_url}}" },
    ],
  },
  {
    title: "Notification",
    menu: [
      { title: "Title", value: "{{title}}" },
      { title: "Body", value: "{{body}}" },
    ],
  },
  {
    title: "Announcement",
    menu: [
      { title: "Author Name", value: "{{author_name}}" },
      { title: "Priority", value: "{{priority}}" },
    ],
  },
  {
    title: "Authentication",
    menu: [
      { title: "OTP Code", value: "{{otp_code}}" },
      { title: "Reset URL", value: "{{reset_url}}" },
      { title: "Reset Code", value: "{{reset_code}}" },
      { title: "User Name", value: "{{user_name}}" },
    ],
  },
];

/** Detect whether the current DaisyUI/CSS theme is dark-mode. */
function isDarkTheme(): boolean {
  if (typeof window === "undefined") return false;
  const theme = document.documentElement.getAttribute("data-theme") ?? "";
  if (theme) return theme.includes("dark");
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export interface EmailEditorWrapperProps {
  /** Initial HTML to load into the editor. */
  initialHtml?: string;
  /** Called when the editor is fully loaded and ready. */
  onReady?: () => void;
  minHeight?: number;
}

/**
 * TinyMCE-based email template editor hook.
 * Returns the Editor component JSX and an exportTemplate function.
 *
 * IMPORTANT: Call this hook inside a component that mounts only when the
 * editor should be visible (e.g. inside a modal gated by a boolean). Calling
 * it unconditionally at a parent level means onInit fires with an empty
 * initialHtml before the user picks a template.
 */
export function useEmailEditor(props: EmailEditorWrapperProps = {}) {
  const editorRef = useRef<TinyMCEEditor | null>(null);
  const [isReady, setIsReady] = useState(false);
  const dark = isDarkTheme();

  const exportTemplate = useCallback((): Promise<{ html: string }> => {
    return new Promise((resolve, reject) => {
      const editor = editorRef.current;
      if (!editor) {
        reject(new Error("Editor not ready"));
        return;
      }
      resolve({ html: editor.getContent() });
    });
  }, []);

  const setContent = useCallback((html: string) => {
    if (editorRef.current) {
      editorRef.current.setContent(html);
    }
  }, []);

  const contentStyle = dark
    ? "body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; padding: 16px; background-color: #1e1e2e; color: #cdd6f4; } img { max-width: 100%; height: auto; }"
    : "body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; padding: 16px; background-color: #ffffff; color: #18181b; } img { max-width: 100%; height: auto; }";

  const EditorComponent = (
    <Editor
      tinymceScriptSrc="/tinymce/tinymce.min.js"
      onInit={(_evt, editor) => {
        editorRef.current = editor;
        setIsReady(true);
        if (props.initialHtml) {
          editor.setContent(props.initialHtml);
        }
        props.onReady?.();
      }}
      licenseKey="gpl"
      init={{
        height: props.minHeight ?? 600,
        skin: dark ? "oxide-dark" : "oxide",
        content_css: dark ? "dark" : "default",
        menubar: "file edit view insert format table",
        plugins: [
          "advlist",
          "autolink",
          "lists",
          "link",
          "image",
          "charmap",
          "preview",
          "anchor",
          "searchreplace",
          "visualblocks",
          "code",
          "fullscreen",
          "insertdatetime",
          "media",
          "table",
          "help",
          "wordcount",
        ],
        toolbar:
          "undo redo | blocks fontfamily fontsize | bold italic underline strikethrough | " +
          "forecolor backcolor | alignleft aligncenter alignright alignjustify | " +
          "bullist numlist outdent indent | link image table | mergetags | " +
          "removeformat | code fullscreen preview | help",
        content_style: contentStyle,
        setup: (editor) => {
          // Custom merge tags dropdown menu
          editor.ui.registry.addMenuButton("mergetags", {
            text: "Merge Tags",
            fetch: (callback) => {
              const items = MERGE_TAGS.map((group) => ({
                type: "nestedmenuitem" as const,
                text: group.title,
                getSubmenuItems: () =>
                  group.menu.map((tag) => ({
                    type: "menuitem" as const,
                    text: tag.title,
                    onAction: () => editor.insertContent(tag.value),
                  })),
              }));
              callback(items);
            },
          });
        },
        promotion: false,
        branding: false,
        convert_urls: false,
        relative_urls: false,
      }}
    />
  );

  return { EditorComponent, exportTemplate, setContent, isReady };
}
