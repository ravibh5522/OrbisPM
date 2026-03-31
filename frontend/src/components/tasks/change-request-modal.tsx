"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form-fields";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";
import type { OrgMember, Task, TaskChangeRequest } from "@/types/domain";
import { AlertCircle, Paperclip, Upload, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";

/** Human-readable labels for task field keys. */
const FIELD_LABELS: Record<string, string> = {
  status: "Status",
  priority: "Priority",
  assignee_id: "Assignee",
  assignee_ids: "Assignees",
  due_date: "Due Date",
  start_date: "Start Date",
  estimated_hours: "Estimated Hours",
  labels: "Labels",
  description: "Description",
  title: "Title",
  reporter_id: "Reporter",
  actual_hours: "Actual Hours",
  recurrence_rule: "Recurrence",
};

function formatValue(
  field: string,
  value: unknown,
  members?: OrgMember[],
): string {
  if (value === null || value === undefined) return "None";
  // Resolve member UUIDs to display names
  if (members && (field === "assignee_id" || field === "reporter_id")) {
    const id = String(value);
    const m = members.find((x) => x.user_id === id);
    return m
      ? m.display_name || m.email || id.slice(0, 8)
      : id.slice(0, 8) + "…";
  }
  if (members && field === "assignee_ids" && Array.isArray(value)) {
    if (!value.length) return "None";
    return value
      .map((id) => {
        const m = members.find((x) => x.user_id === String(id));
        return m
          ? m.display_name || m.email || String(id).slice(0, 8)
          : String(id).slice(0, 8) + "…";
      })
      .join(", ");
  }
  if (Array.isArray(value)) return value.length ? value.join(", ") : "None";
  if (field.endsWith("_date") && typeof value === "string") {
    try {
      return new Date(value).toLocaleDateString();
    } catch {
      return String(value);
    }
  }
  return String(value);
}

interface ChangeRequestModalProps {
  open: boolean;
  onClose: () => void;
  task: Task;
  changes: Partial<Task>;
  orgId: string;
  projectId: string;
  members?: OrgMember[];
  /** Called after successfully creating the change request */
  onCreated: (cr: TaskChangeRequest) => void;
}

export function ChangeRequestModal({
  open,
  onClose,
  task,
  changes,
  orgId,
  projectId,
  members,
  onCreated,
}: ChangeRequestModalProps) {
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileAdd = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
      }
      // Reset so re-selecting same file works
      e.target.value = "";
    },
    [],
  );

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      // Build changes map with only the changed fields
      const changesMap: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(changes)) {
        changesMap[key] = value;
      }

      // Create the change request via HTTP API
      const cr = await api.changeRequests.create(orgId, projectId, task.id, {
        changes: changesMap,
        reason: reason.trim() || undefined,
      });

      // Upload attachments if any
      for (const file of files) {
        try {
          const { upload_url } = await api.changeRequests.attachments.create(
            orgId,
            cr.id,
            {
              filename: file.name,
              file_size: file.size,
              mime_type: file.type || "application/octet-stream",
            },
          );
          // Upload to the pre-signed URL
          await fetch(upload_url, {
            method: "PUT",
            body: file,
            headers: {
              "Content-Type": file.type || "application/octet-stream",
            },
          });
        } catch {
          // Continue uploading other files even if one fails
        }
      }

      onCreated(cr);
      // Reset state
      setReason("");
      setFiles([]);
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to create change request",
      );
    } finally {
      setSubmitting(false);
    }
  }, [changes, orgId, projectId, task.id, reason, files, onCreated, onClose]);

  const changedFields = Object.keys(changes);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request Approval"
      className="max-w-lg"
    >
      <div className="space-y-4">
        {/* Info banner */}
        <div className="alert alert-info text-sm py-2">
          <AlertCircle className="w-4 h-4" />
          <span>These fields require approval before changes are applied.</span>
        </div>

        {/* Proposed changes */}
        <div>
          <span className="text-sm font-medium">Proposed Changes</span>
          <div className="mt-2 space-y-1 bg-base-200 rounded-lg p-3">
            {changedFields.map((field) => {
              const oldValue = task[field as keyof Task];
              const newValue = changes[field as keyof Task];
              return (
                <div key={field} className="flex items-center gap-2 text-sm">
                  <span className="font-medium min-w-[100px]">
                    {FIELD_LABELS[field] || field}
                  </span>
                  <span className="text-base-content/50 line-through text-xs">
                    {formatValue(field, oldValue, members)}
                  </span>
                  <span className="text-base-content/50">→</span>
                  <span className="text-primary font-medium text-xs">
                    {formatValue(field, newValue, members)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Reason */}
        <Textarea
          label="Reason for change"
          placeholder="Explain why this change is needed..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
        />

        {/* File uploads */}
        <div>
          <label className="text-sm font-medium block mb-1">
            <Paperclip className="w-3.5 h-3.5 inline mr-1" />
            Attachments (optional)
          </label>
          <div className="space-y-1">
            {files.map((file, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs bg-base-200 rounded px-2 py-1"
              >
                <span className="truncate flex-1">{file.name}</span>
                <span className="text-base-content/50">
                  {(file.size / 1024).toFixed(0)} KB
                </span>
                <button
                  className="btn btn-ghost btn-xs btn-square"
                  onClick={() => removeFile(i)}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-outline btn-xs gap-1"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-3 h-3" /> Add File
            </button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              multiple
              onChange={handleFileAdd}
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="alert alert-error text-sm py-2">
            <span>{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={submitting}>
            Submit for Review
          </Button>
        </div>
      </div>
    </Modal>
  );
}
