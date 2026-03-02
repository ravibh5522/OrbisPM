"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, Badge, Avatar } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/form-fields";
import {
  Clock,
  Check,
  X,
  AlertCircle,
  GitPullRequest,
  ChevronDown,
  ChevronRight,
  Paperclip,
  Download,
  Trash2,
  Upload,
} from "lucide-react";
import { formatRelative, cn } from "@/lib/utils";
import type { Attachment, TaskChangeRequest, ChangeRequestStatus, OrgMember } from "@/types/domain";

/* ═══════════════════════════════════════════════════════
   Task-level Change Request List
   ═══════════════════════════════════════════════════════ */

interface TaskChangeRequestsProps {
  orgId: string;
  projectId: string;
  taskId: string;
  members: OrgMember[];
}

export function TaskChangeRequests({ orgId, projectId, taskId, members }: TaskChangeRequestsProps) {
  const { data: changeRequests, isLoading } = useQuery({
    queryKey: ["change-requests", orgId, projectId, taskId],
    queryFn: () => api.changeRequests.listByTask(orgId, projectId, taskId),
    enabled: !!orgId,
  });

  if (isLoading) return <div className="loading loading-spinner loading-sm" />;

  const items: TaskChangeRequest[] = changeRequests?.data || changeRequests || [];
  if (items.length === 0) return null;

  const pending = items.filter((cr) => cr.status === "pending");
  const resolved = items.filter((cr) => cr.status !== "pending");

  return (
    <Card title="Change Requests">
      {pending.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-warning flex items-center gap-1 mb-2">
            <Clock className="w-4 h-4" /> Pending Review ({pending.length})
          </h4>
          <div className="space-y-2">
            {pending.map((cr) => (
              <ChangeRequestRow key={cr.id} cr={cr} orgId={orgId} projectId={projectId} members={members} />
            ))}
          </div>
        </div>
      )}
      {resolved.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-base-content/60 mb-2">
            Resolved ({resolved.length})
          </h4>
          <div className="space-y-2">
            {resolved.slice(0, 5).map((cr) => (
              <ChangeRequestRow key={cr.id} cr={cr} orgId={orgId} projectId={projectId} members={members} />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════
   Project-level Change Request List
   ═══════════════════════════════════════════════════════ */

interface ProjectChangeRequestsProps {
  orgId: string;
  projectId: string;
  members: OrgMember[];
}

export function ProjectChangeRequests({ orgId, projectId, members }: ProjectChangeRequestsProps) {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ChangeRequestStatus | "all">("pending");

  const { data, isLoading } = useQuery({
    queryKey: ["project-change-requests", orgId, projectId, statusFilter, page],
    queryFn: () =>
      api.changeRequests.listByProject(
        orgId,
        projectId,
        statusFilter === "all" ? undefined : statusFilter,
        page,
        20
      ),
    enabled: !!orgId,
  });

  const items: TaskChangeRequest[] = data?.data || data || [];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <GitPullRequest className="w-5 h-5" /> Change Requests
          </h3>
          <div className="join">
            {(["pending", "approved", "rejected", "all"] as const).map((s) => (
              <button
                key={s}
                className={cn("join-item btn btn-xs", statusFilter === s ? "btn-active" : "")}
                onClick={() => { setStatusFilter(s); setPage(1); }}
              >
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-6"><div className="loading loading-spinner" /></div>
        ) : items.length === 0 ? (
          <p className="text-center py-6 text-base-content/50">No change requests found</p>
        ) : (
          <div className="space-y-3">
            {items.map((cr) => (
              <ChangeRequestRow key={cr.id} cr={cr} orgId={orgId} projectId={projectId} members={members} showTask />
            ))}
          </div>
        )}

        {items.length >= 20 && (
          <div className="flex justify-center gap-2 mt-4">
            <Button size="xs" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-sm text-base-content/60">Page {page}</span>
            <Button size="xs" variant="ghost" onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Single Change Request Row with Approve/Reject
   ═══════════════════════════════════════════════════════ */

function ChangeRequestRow({
  cr,
  orgId,
  projectId,
  members,
  showTask,
}: {
  cr: TaskChangeRequest;
  orgId: string;
  projectId: string;
  members: OrgMember[];
  showTask?: boolean;
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [showReview, setShowReview] = useState(false);

  const approveMutation = useMutation({
    mutationFn: (note: string) => api.changeRequests.approve(orgId, cr.id, note || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["change-requests"] });
      qc.invalidateQueries({ queryKey: ["project-change-requests"] });
      qc.invalidateQueries({ queryKey: ["task"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setShowReview(false);
      setReviewNote("");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (note: string) => api.changeRequests.reject(orgId, cr.id, note || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["change-requests"] });
      qc.invalidateQueries({ queryKey: ["project-change-requests"] });
      setShowReview(false);
      setReviewNote("");
    },
  });

  const proposer = members.find((m) => m.user_id === cr.proposer_id);
  const reviewer = cr.reviewer_id ? members.find((m) => m.user_id === cr.reviewer_id) : null;

  const statusBadge = {
    pending: <Badge variant="warning">Pending</Badge>,
    approved: <Badge variant="success">Approved</Badge>,
    rejected: <Badge variant="error">Rejected</Badge>,
  };

  const changes = cr.changes || {};

  return (
    <div className="border border-base-300 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => setExpanded(!expanded)} className="flex-shrink-0">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <Avatar name={proposer?.display_name || "?"} src={proposer?.avatar_url} size="sm" />
          <div className="min-w-0">
            <span className="text-sm font-medium truncate block">
              {proposer?.display_name || proposer?.email || cr.proposer_id.slice(0, 8)}
            </span>
            <span className="text-xs text-base-content/50">
              {formatRelative(cr.created_at)}
              {showTask && cr.task_id && <span> • Task {cr.task_id.slice(0, 8)}</span>}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {statusBadge[cr.status]}
          {cr.status === "pending" && (
            <div className="flex gap-1">
              <Button
                size="xs"
                variant="outline"
                onClick={() => setShowReview(true)}
                title="Review"
              >
                <AlertCircle className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 ml-10 space-y-2">
          {/* Changes detail */}
          <div className="text-sm">
            <span className="font-medium">Proposed Changes:</span>
            <div className="mt-1 space-y-1">
              {Object.entries(changes).map(([field, value]) => (
                <div key={field} className="flex items-center gap-2">
                  <span className="badge badge-ghost badge-sm font-mono">{field}</span>
                  <span className="text-base-content/60">→</span>
                  <span className="text-sm">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
          {cr.reason && (
            <div className="text-sm">
              <span className="font-medium">Reason:</span> {cr.reason}
            </div>
          )}
          {cr.review_note && (
            <div className="text-sm">
              <span className="font-medium">Review Note:</span> {cr.review_note}
              {reviewer && <span className="text-base-content/50"> — {reviewer.display_name || reviewer.email}</span>}
            </div>
          )}

          {/* Attachments */}
          <ChangeRequestAttachmentsSection orgId={orgId} crId={cr.id} />
        </div>
      )}

      {/* Review Modal */}
      <Modal open={showReview} onClose={() => setShowReview(false)} title="Review Change Request">
        <div className="space-y-4">
          <div>
            <span className="text-sm font-medium">Proposed Changes:</span>
            <div className="mt-2 space-y-1 bg-base-200 rounded-lg p-3">
              {Object.entries(changes).map(([field, value]) => (
                <div key={field} className="flex items-center gap-2 text-sm">
                  <span className="font-mono badge badge-ghost badge-sm">{field}</span>
                  <span>→</span>
                  <span>{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
          {cr.reason && (
            <div className="text-sm">
              <span className="font-medium">Reason:</span> {cr.reason}
            </div>
          )}
          <Textarea
            label="Review Note (optional)"
            placeholder="Add a note about your decision..."
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowReview(false)}>
              Cancel
            </Button>
            <Button
              variant="error"
              onClick={() => rejectMutation.mutate(reviewNote)}
              loading={rejectMutation.isPending}
            >
              <X className="w-4 h-4 mr-1" /> Reject
            </Button>
            <Button
              onClick={() => approveMutation.mutate(reviewNote)}
              loading={approveMutation.isPending}
            >
              <Check className="w-4 h-4 mr-1" /> Approve
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Attachments section inside a Change Request
   ═══════════════════════════════════════════════════════ */

function ChangeRequestAttachmentsSection({ orgId, crId }: { orgId: string; crId: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["cr-attachments", orgId, crId],
    queryFn: () => api.changeRequests.attachments.list(orgId, crId),
    enabled: !!crId,
  });

  const items: Attachment[] = data?.data || [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.changeRequests.attachments.delete(orgId, crId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cr-attachments", orgId, crId] }),
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await api.changeRequests.attachments.create(orgId, crId, {
        filename: file.name,
        file_size: file.size,
        mime_type: file.type || "application/octet-stream",
      });
      // PUT the file directly to the presigned MinIO URL
      await fetch(res.upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      qc.invalidateQueries({ queryKey: ["cr-attachments", orgId, crId] });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDownload = async (att: Attachment) => {
    setLoadingId(att.id);
    try {
      const res = await api.changeRequests.attachments.download(orgId, crId, att.id);
      window.open(res.download_url, "_blank");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium flex items-center gap-1">
          <Paperclip className="w-3 h-3" /> Attachments {items.length > 0 && `(${items.length})`}
        </span>
        <label className={cn("btn btn-ghost btn-xs gap-1 cursor-pointer", uploading && "loading")}>
          <Upload className="w-3 h-3" />
          {uploading ? "Uploading…" : "Attach"}
          <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-base-content/40 px-1">No attachments</p>
      ) : (
        <div className="space-y-1">
          {items.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-2 p-1.5 rounded border border-base-200 hover:bg-base-200/50 group text-xs"
            >
              <Paperclip className="w-3 h-3 shrink-0 text-base-content/50" />
              <span className="flex-1 truncate">{att.filename}</span>
              <span className="text-base-content/40 shrink-0">{(att.file_size / 1024).toFixed(0)} KB</span>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                <button
                  className="btn btn-ghost btn-xs btn-square"
                  disabled={loadingId === att.id}
                  onClick={() => handleDownload(att)}
                  title="Download"
                >
                  <Download className="w-3 h-3" />
                </button>
                <button
                  className="btn btn-ghost btn-xs btn-square text-error"
                  onClick={() => deleteMutation.mutate(att.id)}
                  title="Delete"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Pending Review Indicator (badge for task cards)
   ═══════════════════════════════════════════════════════ */

export function PendingReviewBadge({ count }: { count?: number }) {
  if (!count || count <= 0) return null;
  return (
    <span className="badge badge-warning badge-sm gap-1" title={`${count} pending change request(s)`}>
      <Clock className="w-3 h-3" />
      {count}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════
   Inline toast after update when change request was created
   ═══════════════════════════════════════════════════════ */

export function ChangeRequestToast({
  result,
  onDismiss,
}: {
  result: { pending_review?: boolean; change_request?: TaskChangeRequest } | null;
  onDismiss: () => void;
}) {
  if (!result?.pending_review || !result.change_request) return null;

  const fields = Object.keys(result.change_request.changes || {});

  return (
    <div className="alert alert-warning shadow-lg mb-4">
      <AlertCircle className="w-5 h-5" />
      <div>
        <h4 className="font-bold text-sm">Changes Pending Review</h4>
        <p className="text-xs">
          Your changes to <strong>{fields.join(", ")}</strong> require approval before being applied.
        </p>
      </div>
      <button className="btn btn-ghost btn-xs" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
