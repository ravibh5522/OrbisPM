"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo,
} from "lucide-react";
import { useCallback, useEffect } from "react";

/* ═══════════════════════════════════════════════════════
   Reusable Tiptap-based Rich Text Editor
   ═══════════════════════════════════════════════════════ */

interface RichTextEditorProps {
  content: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
  /** Compact mode: smaller toolbar + minimal padding */
  compact?: boolean;
  className?: string;
  /** Auto-focus */
  autoFocus?: boolean;
}

export function RichTextEditor({
  content,
  onChange,
  placeholder = "Write something...",
  editable = true,
  compact = false,
  className,
  autoFocus = false,
}: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false, // we use lowlight extension or default
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-primary underline cursor-pointer" },
      }),
      Placeholder.configure({ placeholder }),
      Underline,
    ],
    content,
    editable,
    autofocus: autoFocus,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-none focus:outline-none",
          compact ? "min-h-[60px] p-2" : "min-h-[120px] p-3",
          "prose-headings:font-semibold prose-headings:text-base-content",
          "prose-p:text-base-content prose-p:my-1",
          "prose-li:text-base-content",
          "prose-a:text-primary prose-a:underline",
          "prose-code:bg-base-200 prose-code:px-1 prose-code:rounded prose-code:text-sm",
          "prose-blockquote:border-l-4 prose-blockquote:border-base-300 prose-blockquote:pl-3 prose-blockquote:italic",
        ),
      },
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
  });

  // Sync content from outside
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  if (!editor) return null;

  return (
    <div
      className={cn(
        "border border-base-300 rounded-lg overflow-hidden bg-base-100",
        className,
      )}
    >
      {editable && <Toolbar editor={editor} compact={compact} />}
      <EditorContent editor={editor} />
    </div>
  );
}

/* ── Read-only rich text viewer (no toolbar, no border) ── */
export function RichTextViewer({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Link.configure({
        openOnClick: true,
        HTMLAttributes: { class: "text-primary underline cursor-pointer" },
      }),
      Underline,
    ],
    content,
    editable: false,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-none",
          "prose-headings:font-semibold prose-headings:text-base-content",
          "prose-p:text-base-content prose-p:my-1",
          "prose-li:text-base-content",
          "prose-a:text-primary prose-a:underline",
          "prose-code:bg-base-200 prose-code:px-1 prose-code:rounded prose-code:text-sm",
          "prose-blockquote:border-l-4 prose-blockquote:border-base-300 prose-blockquote:pl-3 prose-blockquote:italic",
        ),
      },
    },
  });

  // Keep content in sync
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  if (!editor) return null;

  return <EditorContent editor={editor} className={className} />;
}

/* ═══════════════════════════════════════════════════════
   Toolbar Component
   ═══════════════════════════════════════════════════════ */

function Toolbar({ editor, compact }: { editor: Editor; compact?: boolean }) {
  const setLink = useCallback(() => {
    const prev = editor.getAttributes("link").href;
    const url = window.prompt("URL", prev || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-base-300 px-1 py-0.5 bg-base-200/40">
      {/* Text formatting */}
      <Button
        variant="ghost"
        size="xs"
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={cn(editor.isActive("bold") && "btn-active")}
        title="Bold"
      >
        <Bold className="w-3.5 h-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="xs"
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={cn(editor.isActive("italic") && "btn-active")}
        title="Italic"
      >
        <Italic className="w-3.5 h-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="xs"
        type="button"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={cn(editor.isActive("underline") && "btn-active")}
        title="Underline"
      >
        <UnderlineIcon className="w-3.5 h-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="xs"
        type="button"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={cn(editor.isActive("strike") && "btn-active")}
        title="Strikethrough"
      >
        <Strikethrough className="w-3.5 h-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="xs"
        type="button"
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={cn(editor.isActive("code") && "btn-active")}
        title="Inline code"
      >
        <Code className="w-3.5 h-3.5" />
      </Button>

      <div className="divider divider-horizontal mx-0 h-5" />

      {/* Headings */}
      {!compact && (
        <>
          <Button
            variant="ghost"
            size="xs"
            type="button"
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
            className={cn(
              editor.isActive("heading", { level: 1 }) && "btn-active",
            )}
            title="Heading 1"
          >
            <Heading1 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            type="button"
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            className={cn(
              editor.isActive("heading", { level: 2 }) && "btn-active",
            )}
            title="Heading 2"
          >
            <Heading2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            type="button"
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
            className={cn(
              editor.isActive("heading", { level: 3 }) && "btn-active",
            )}
            title="Heading 3"
          >
            <Heading3 className="w-3.5 h-3.5" />
          </Button>

          <div className="divider divider-horizontal mx-0 h-5" />
        </>
      )}

      {/* Lists */}
      <Button
        variant="ghost"
        size="xs"
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={cn(editor.isActive("bulletList") && "btn-active")}
        title="Bullet list"
      >
        <List className="w-3.5 h-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="xs"
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={cn(editor.isActive("orderedList") && "btn-active")}
        title="Numbered list"
      >
        <ListOrdered className="w-3.5 h-3.5" />
      </Button>

      {/* Blockquote & HR */}
      <Button
        variant="ghost"
        size="xs"
        type="button"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={cn(editor.isActive("blockquote") && "btn-active")}
        title="Blockquote"
      >
        <Quote className="w-3.5 h-3.5" />
      </Button>
      {!compact && (
        <Button
          variant="ghost"
          size="xs"
          type="button"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontal rule"
        >
          <Minus className="w-3.5 h-3.5" />
        </Button>
      )}

      <div className="divider divider-horizontal mx-0 h-5" />

      {/* Link */}
      <Button
        variant="ghost"
        size="xs"
        type="button"
        onClick={setLink}
        className={cn(editor.isActive("link") && "btn-active")}
        title="Insert link"
      >
        <LinkIcon className="w-3.5 h-3.5" />
      </Button>

      {/* Undo / Redo */}
      <div className="ml-auto flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="xs"
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo"
        >
          <Undo className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="xs"
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo"
        >
          <Redo className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
