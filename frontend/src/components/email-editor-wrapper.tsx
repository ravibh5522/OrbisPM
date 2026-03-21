"use client";

import { Editor } from "@tinymce/tinymce-react";
import { useCallback, useRef, useState } from "react";
import type { Editor as TinyMCEEditor } from "tinymce";

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
 */
export function useEmailEditor(props: EmailEditorWrapperProps = {}) {
  const editorRef = useRef<TinyMCEEditor | null>(null);
  const [isReady, setIsReady] = useState(false);

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
        content_style:
          "body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; padding: 16px; } img { max-width: 100%; height: auto; }",
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
