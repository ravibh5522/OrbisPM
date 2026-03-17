"use client";

import { useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import type { EditorRef, EmailEditorProps } from "react-email-editor";

// Load Unlayer only on the client (it requires DOM / window)
const EmailEditor = dynamic(() => import("react-email-editor"), { ssr: false });

/**
 * Merge tags available in every email template.
 * Maps directly to the Jinja2 `{{ variable }}` syntax used by the email-service.
 */
const MERGE_TAGS: Record<string, Record<string, { name: string; value: string }>> = {
  General: {
    app_name: { name: "App Name", value: "{{app_name}}" },
    frontend_url: { name: "App URL", value: "{{frontend_url}}" },
  },
  Notification: {
    title: { name: "Title", value: "{{title}}" },
    body: { name: "Body", value: "{{body}}" },
  },
  Announcement: {
    author_name: { name: "Author Name", value: "{{author_name}}" },
    priority: { name: "Priority", value: "{{priority}}" },
  },
  Authentication: {
    otp_code: { name: "OTP Code", value: "{{otp_code}}" },
    reset_url: { name: "Reset URL", value: "{{reset_url}}" },
    reset_code: { name: "Reset Code", value: "{{reset_code}}" },
    user_name: { name: "User Name", value: "{{user_name}}" },
  },
};

export interface EmailEditorWrapperProps {
  /** Initial Unlayer design JSON to load (for re-editing). */
  initialDesign?: Record<string, unknown> | null;
  /** Upload endpoint URL (e.g. /api/v1/orgs/{orgId}/uploads). */
  uploadUrl?: string;
  /** Bearer token for authenticated image uploads. */
  authToken?: string;
  /** Called when the editor is fully loaded and ready. */
  onReady?: () => void;
  minHeight?: number;
}

export interface EmailEditorWrapperRef {
  /** Export the current design as { html, design }. */
  exportTemplate: () => Promise<{ html: string; design: Record<string, unknown> }>;
}

/**
 * A thin wrapper around Unlayer's react-email-editor that:
 *  - pre-configures merge tags matching OrbisPM's Jinja2 variables
 *  - wires image uploads to the MinIO-backed /uploads endpoint
 *  - provides a simple `exportTemplate()` API
 */
export function useEmailEditor(props: EmailEditorWrapperProps = {}) {
  const editorRef = useRef<EditorRef>(null);
  const readyRef = useRef(false);

  const onReady = useCallback(
    (unlayer: any) => {
      readyRef.current = true;

      // Load initial design if provided
      if (props.initialDesign) {
        unlayer.loadDesign(props.initialDesign);
      }

      props.onReady?.();
    },
    [props.initialDesign, props.onReady],
  );

  const exportTemplate = useCallback((): Promise<{ html: string; design: Record<string, unknown> }> => {
    return new Promise((resolve, reject) => {
      const editor = editorRef.current?.editor;
      if (!editor) {
        reject(new Error("Editor not ready"));
        return;
      }

      editor.exportHtml((data: any) => {
        const { html, design } = data;
        resolve({ html, design });
      });
    });
  }, []);

  const editorOptions: EmailEditorProps["options"] = {
    mergeTags: MERGE_TAGS,
    features: {
      stockImages: { enabled: false },
      userUploads: { enabled: true },
    },
    appearance: {
      theme: "modern_light",
    },
    tools: {
      image: {
        enabled: true,
      },
    },
  };

  // Wire image uploads to our backend if upload URL provided
  if (props.uploadUrl && props.authToken) {
    (editorOptions as any).imageUpload = {
      url: props.uploadUrl,
      headers: {
        Authorization: `Bearer ${props.authToken}`,
      },
      // The backend expects a "file" form field
      fieldName: "file",
    };
  }

  const EditorComponent = (
    <EmailEditor
      ref={editorRef as any}
      onReady={onReady}
      minHeight={props.minHeight ?? 600}
      options={editorOptions}
      style={{ border: "1px solid hsl(var(--b3, 0 0% 86%))", borderRadius: "0.75rem", overflow: "hidden" }}
    />
  );

  return { EditorComponent, exportTemplate, editorRef };
}
