"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes } from "@/lib/utils";
import { AlertTriangle, Download, File, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

type Disposition = "inline" | "attachment";
type PreviewKind = "image" | "pdf" | "video" | "audio" | "text" | "none";

interface FilePreviewProps {
  file: { name: string; mimeType: string | null; size: number | null };
  getUrl: (disposition: Disposition) => Promise<string>;
  onClose: () => void;
}

// Text previews are fetched into memory, so cap them.
const TEXT_PREVIEW_LIMIT = 1024 * 1024;

const TEXT_MIMES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-javascript",
  "application/typescript",
  "application/x-yaml",
  "application/yaml",
  "application/toml",
  "application/sql",
  "application/x-sh",
]);

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "xml", "yml", "yaml",
  "toml", "ini", "log", "sql", "sh", "js", "jsx", "ts", "tsx", "py", "go",
  "rs", "java", "kt", "rb", "php", "c", "h", "cpp", "hpp", "cs", "swift",
  "css", "scss", "html", "htm", "vue", "svelte",
]);

function previewKind(name: string, mime: string | null): PreviewKind {
  const m = mime ?? "";
  if (m.startsWith("image/")) return "image";
  if (m === "application/pdf") return "pdf";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (m.startsWith("text/") || TEXT_MIMES.has(m) || TEXT_EXTENSIONS.has(ext))
    return "text";
  return "none";
}

/**
 * Lightbox preview for a stored file. Images, PDF, video and audio render
 * natively; text-like files are fetched and shown as plain text (never as
 * HTML); everything else gets a download card.
 */
export function FilePreview({ file, getUrl, onClose }: FilePreviewProps) {
  const [mounted, setMounted] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const tooLargeForText = (file.size ?? 0) > TEXT_PREVIEW_LIMIT;
  const kind = previewKind(file.name, file.mimeType);
  const effectiveKind = kind === "text" && tooLargeForText ? "none" : kind;

  useEffect(() => {
    setMounted(true);
    // Return focus to whatever opened the preview (e.g. the list row).
    const opener = document.activeElement as HTMLElement | null;
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
  }, [mounted]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (effectiveKind === "none") return;
    let cancelled = false;
    (async () => {
      try {
        const u = await getUrl("inline");
        if (effectiveKind === "text") {
          const res = await fetch(u);
          if (!res.ok) throw new Error("fetch failed");
          const body = await res.text();
          if (!cancelled) setText(body);
        }
        if (!cancelled) setUrl(u);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveKind, getUrl]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const u = await getUrl("attachment");
      const a = document.createElement("a");
      a.href = u;
      a.rel = "noopener";
      a.click();
    } catch {
      toast.error("Download failed");
    } finally {
      setDownloading(false);
    }
  };

  if (!mounted) return null;

  const loading = effectiveKind !== "none" && !url && !failed;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${file.name}`}
    >
      <div
        className="relative bg-base-100 rounded-lg shadow-xl max-w-4xl max-h-[90vh] w-full overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-base-200">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate" title={file.name}>
              {file.name}
            </h3>
            {file.size != null && (
              <p className="text-xs text-base-content/50">
                {formatBytes(file.size)}
              </p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              variant="ghost"
              size="xs"
              className="gap-1"
              onClick={handleDownload}
              loading={downloading}
            >
              {!downloading && <Download className="w-3 h-3" />} Download
            </Button>
            <button
              ref={closeRef}
              className="btn btn-ghost btn-xs btn-square"
              onClick={onClose}
              aria-label="Close preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 min-h-0 items-center justify-center overflow-auto p-4">
          {loading && <Skeleton className="w-full h-[60vh]" />}

          {failed && (
            <FallbackCard
              icon={<AlertTriangle className="w-10 h-10 text-warning" />}
              title="Couldn't load preview"
              onDownload={handleDownload}
              downloading={downloading}
            />
          )}

          {effectiveKind === "none" && !failed && (
            <FallbackCard
              icon={<File className="w-10 h-10 text-base-content/30" />}
              title={
                kind === "text"
                  ? "This file is too large to preview"
                  : "No preview available for this file type"
              }
              onDownload={handleDownload}
              downloading={downloading}
            />
          )}

          {url && !failed && effectiveKind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={file.name}
              className="max-w-full max-h-[75vh] object-contain rounded"
              onError={() => setFailed(true)}
            />
          )}
          {url && !failed && effectiveKind === "pdf" && (
            <iframe
              src={url}
              className="w-full h-[75vh] rounded"
              title={file.name}
            />
          )}
          {url && !failed && effectiveKind === "video" && (
            <video
              src={url}
              controls
              className="max-w-full max-h-[75vh] rounded"
              onError={() => setFailed(true)}
            />
          )}
          {url && !failed && effectiveKind === "audio" && (
            <audio
              src={url}
              controls
              className="w-full max-w-md"
              onError={() => setFailed(true)}
            />
          )}
          {url && !failed && effectiveKind === "text" && (
            <pre className="w-full self-stretch text-xs font-mono whitespace-pre-wrap break-words bg-base-200 rounded-lg p-4">
              {text}
            </pre>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function FallbackCard({
  icon,
  title,
  onDownload,
  downloading,
}: {
  icon: React.ReactNode;
  title: string;
  onDownload: () => void;
  downloading: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
      {icon}
      <p className="text-sm font-medium">{title}</p>
      <Button
        variant="outline"
        size="sm"
        onClick={onDownload}
        loading={downloading}
      >
        {!downloading && <Download className="w-4 h-4" />} Download
      </Button>
    </div>
  );
}
