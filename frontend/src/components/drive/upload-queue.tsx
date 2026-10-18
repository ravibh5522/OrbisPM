"use client";

import { DriveItemIcon } from "@/components/drive/drive-item-list";
import { cn, formatBytes } from "@/lib/utils";
import {
  MAX_FILE_BYTES,
  useDriveUploadStore,
  type DriveUpload,
} from "@/stores/drive-upload-store";
import { useUIStore } from "@/stores/ui-store";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CloudUpload,
  RotateCcw,
  X,
} from "lucide-react";

const isActive = (u: DriveUpload) =>
  u.status === "queued" || u.status === "uploading";

/** Docked upload progress card; lives in OrgLayout so uploads survive navigation. */
export function UploadQueue() {
  const { uploads, collapsed, setCollapsed, cancel, retry, clearFinished } =
    useDriveUploadStore();
  const drivePanelOpen = useUIStore((s) => s.drivePanelOpen);

  if (uploads.length === 0) return null;

  const active = uploads.filter(isActive);
  const failed = uploads.filter((u) => u.status === "error").length;
  const title = active.length
    ? `Uploading ${active.length} ${active.length === 1 ? "file" : "files"}`
    : failed
      ? `${failed} ${failed === 1 ? "upload" : "uploads"} failed`
      : "Uploads complete";
  const overall =
    active.reduce((sum, u) => sum + u.progress, 0) / (active.length || 1);

  return (
    <div
      role="region"
      aria-label="Uploads"
      className={cn(
        "fixed bottom-4 right-4 z-[55] w-[calc(100vw-2rem)] sm:w-80 overflow-hidden",
        "rounded-box border border-base-200 bg-base-100/95 backdrop-blur-[20px] shadow-lg",
        drivePanelOpen && "lg:right-[416px]",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-base-200">
        <CloudUpload className="w-4 h-4 text-primary shrink-0" />
        <h3 className="flex-1 text-sm font-semibold truncate" aria-live="polite">
          {title}
        </h3>
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-square"
          aria-label={collapsed ? "Expand uploads" : "Collapse uploads"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
        {active.length === 0 && (
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-square"
            aria-label="Dismiss uploads"
            onClick={clearFinished}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {active.length > 0 && (
        <div className="h-0.5 bg-base-200">
          <div
            className="h-full bg-primary transition-[width] duration-200"
            style={{ width: `${Math.round(overall * 100)}%` }}
          />
        </div>
      )}

      {!collapsed && (
        <ul className="max-h-64 overflow-y-auto py-1">
          {uploads.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-3 py-2">
              <DriveItemIcon
                item={{ kind: "file", name: u.file.name, mime_type: u.file.type }}
                className="w-4 h-4 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate" title={u.file.name}>
                  {u.file.name}
                </p>
                <p
                  className={cn(
                    "text-xs truncate",
                    u.status === "error" ? "text-error" : "text-base-content/50",
                  )}
                >
                  {u.status === "uploading" &&
                    `${Math.round(u.progress * 100)}% of ${formatBytes(u.file.size)}`}
                  {u.status === "queued" && "Waiting..."}
                  {u.status === "done" && formatBytes(u.file.size)}
                  {u.status === "cancelled" && "Cancelled"}
                  {u.status === "error" && u.error}
                </p>
                {u.status === "uploading" && (
                  <div className="mt-1 h-1 rounded-full bg-base-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-200"
                      style={{ width: `${Math.round(u.progress * 100)}%` }}
                    />
                  </div>
                )}
              </div>
              {isActive(u) && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs btn-square"
                  aria-label={`Cancel upload of ${u.file.name}`}
                  onClick={() => cancel(u.id)}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              {(u.status === "error" || u.status === "cancelled") &&
                u.file.size <= MAX_FILE_BYTES && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs btn-square"
                    aria-label={`Retry upload of ${u.file.name}`}
                    onClick={() => retry(u.id)}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              {u.status === "done" && (
                <CheckCircle2
                  className="w-4 h-4 text-success shrink-0"
                  aria-label="Uploaded"
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
