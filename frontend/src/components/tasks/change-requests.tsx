"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form-fields";
import { Modal } from "@/components/ui/modal";
import { Avatar, Badge, Card } from "@/components/ui/shared";
import { useProjectPolicies } from "@/hooks/use-policies";
import { api } from "@/lib/api"; // kept for CR attachment binary ops
import { cn, formatRelative } from "@/lib/utils";
import { useProjectTaskStore } from "@/stores/project-task-store";
import type {
    Attachment,
    ChangeRequestStatus,
    OrgMember,
    TaskChangeRequest,
} from "@/types/domain";
import {
    AlertCircle,
    Check,
    Clock,
    Download,
    FileText,
    GitPullRequest,
    Image as ImageIcon,
    Paperclip,
    Play,
    Trash2,
    Upload,
    X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/** Human-readable field labels (kept local to avoid cross-file dep) */
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

function resolveMember(id: string, members: OrgMember[]): string {
  const m = members.find((x) => x.user_id === id);
  return m ? m.display_name || m.email || id.slice(0, 8) : id.slice(0, 8) + "…";
}

function formatFieldValue(
  field: string,
  value: unknown,
  members: OrgMember[],
): string {
  if (value === null || value === undefined) return "—";
  if (field === "assignee_id" || field === "reporter_id") {
    return resolveMember(String(value), members);
  }
  if (field === "assignee_ids" && Array.isArray(value)) {
    return value.length
      ? value.map((id) => resolveMember(String(id), members)).join(", ")
      : "None";
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

/* ═══════════════════════════════════════════════════════
   Task-level Change Request List
   ═══════════════════════════════════════════════════════ */

interface TaskChangeRequestsProps {
  orgId: string;
  projectId: string;
  taskId: string;
  members: OrgMember[];
}

export function TaskChangeRequests({
  orgId,
  projectId,
  taskId,
  members,
}: TaskChangeRequestsProps) {
  const send = useProjectTaskStore((s) => s.send);
  const policies = useProjectPolicies(projectId);
  const [items, setItems] = useState<TaskChangeRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCRs = useCallback(async () => {
    if (!send) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await send("cr:list", { task_id: taskId });
      const raw = res?.data;
      setItems(Array.isArray(raw) ? raw : []);
    } catch {
    } finally {
      setIsLoading(false);
    }
  }, [send, taskId]);

  const handleItemUpdate = useCallback(
    (id: string, patch: Partial<TaskChangeRequest>) =>
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      ),
    [],
  );

  useEffect(() => {
    fetchCRs();
  }, [fetchCRs]);

  if (isLoading) return <div className="loading loading-spinner loading-sm" />;
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
          <CRTable
            items={pending}
            orgId={orgId}
            projectId={projectId}
            members={members}
            canReview={policies.canReview}
            onRefresh={fetchCRs}
            onItemUpdate={handleItemUpdate}
          />
        </div>
      )}
      {resolved.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-base-content/60 mb-2">
            Resolved ({resolved.length})
          </h4>
          <CRTable
            items={resolved.slice(0, 5)}
            orgId={orgId}
            projectId={projectId}
            members={members}
            canReview={policies.canReview}
            onRefresh={fetchCRs}
            onItemUpdate={handleItemUpdate}
          />
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

const PAGE_SIZE = 20;

function ProposerFilterDropdown({
  value,
  onChange,
  members,
}: {
  value: string;
  onChange: (v: string) => void;
  members: OrgMember[];
}) {
  const selected =
    value === "all" ? null : members.find((m) => m.user_id === value) || null;
  const selectedLabel =
    value === "all"
      ? "All proposers"
      : selected?.display_name || selected?.email || "Unknown proposer";

  return (
    <details className="dropdown dropdown-bottom dropdown-end relative z-[40] open:z-[260] min-w-[220px]">
      <summary className="inline-flex h-10 min-h-10 w-full cursor-pointer list-none items-center justify-between rounded-xl border border-base-200/55 bg-base-100/45 px-3 text-sm backdrop-blur-md task-filter-select">
        <span className="truncate">{selectedLabel}</span>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-3.5 w-3.5 text-base-content/60"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </summary>

      <ul className="dropdown-content task-status-menu z-[300] mt-1 max-h-72 w-full overflow-y-auto rounded-xl border p-1 shadow-xl backdrop-blur-2xl">
        <li>
          <button
            type="button"
            className={cn(
              "task-status-item flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors",
              value === "all"
                ? "task-status-item-active"
                : "text-base-content/80 hover:bg-base-200/35",
            )}
            onClick={(e) => {
              onChange("all");
              const details = e.currentTarget.closest("details");
              if (details) details.removeAttribute("open");
            }}
          >
            <span className="truncate">All proposers</span>
            {value === "all" ? <span className="text-xs">✓</span> : null}
          </button>
        </li>

        {members.map((m) => {
          const isActive = value === m.user_id;
          const label = m.display_name || m.email || m.user_id;
          return (
            <li key={m.user_id}>
              <button
                type="button"
                className={cn(
                  "task-status-item flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                  isActive
                    ? "task-status-item-active"
                    : "text-base-content/80 hover:bg-base-200/35",
                )}
                onClick={(e) => {
                  onChange(m.user_id);
                  const details = e.currentTarget.closest("details");
                  if (details) details.removeAttribute("open");
                }}
              >
                <span className="truncate">{label}</span>
                {isActive ? <span className="text-xs">✓</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export function ProjectChangeRequests({
  orgId,
  projectId,
  members,
}: ProjectChangeRequestsProps) {
  const policies = useProjectPolicies(projectId);

  // Filter / search state
  const [statusFilter, setStatusFilter] = useState<ChangeRequestStatus | "all">(
    "pending",
  );
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [proposerFilter, setProposerFilter] = useState<string>("all");

  // Pagination state
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Data state
  const [items, setItems] = useState<TaskChangeRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchCRs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.changeRequests.listByProject(orgId, projectId, {
        status: statusFilter !== "all" ? statusFilter : undefined,
        search: debouncedSearch || undefined,
        proposer_id: proposerFilter !== "all" ? proposerFilter : undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      setItems(res?.data ?? []);
      setTotal(res?.total ?? 0);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [orgId, projectId, statusFilter, debouncedSearch, proposerFilter, page]);

  const handleItemUpdate = useCallback(
    (id: string, patch: Partial<TaskChangeRequest>) =>
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      ),
    [],
  );

  useEffect(() => {
    fetchCRs();
  }, [fetchCRs]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <Card allowOverflow className="relative z-20">
        {/* ── Header row ── */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h3 className="font-semibold flex items-center gap-2 mr-auto">
            <GitPullRequest className="w-5 h-5" /> Change Requests
            {total > 0 && (
              <span className="badge badge-ghost badge-sm">{total}</span>
            )}
          </h3>

          {/* Status filter pills */}
          <div
            role="tablist"
            className="project-tabs-shell tabs tabs-boxed rounded-2xl p-1"
          >
            {(["pending", "approved", "rejected", "all"] as const).map((s) => (
              <button
                key={s}
                role="tab"
                className={cn(
                  "project-tab-btn tab tab-xs rounded-xl",
                  statusFilter === s
                    ? "project-tab-active"
                    : "project-tab-inactive",
                )}
                onClick={() => {
                  setStatusFilter(s);
                  setPage(1);
                }}
              >
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* ── Filter / Search bar ── */}
        <div className="relative z-30 flex flex-wrap gap-2 mb-4">
          {/* Search box */}
          <div className="relative flex-1 min-w-[160px]">
            <span className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none">
              <svg
                className="w-3.5 h-3.5 text-base-content/40"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
                />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search reason or task title…"
              className="h-10 w-full rounded-xl search-anchor-surface bg-transparent px-3 pl-8 pr-8 text-sm text-base-content placeholder:text-base-content/45 focus:outline-none focus:ring-2 focus:ring-oklch(64%_0.18_180_/_0.35)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                className="absolute inset-y-0 right-2 flex items-center text-base-content/40 hover:text-base-content"
                onClick={() => setSearch("")}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Proposer filter */}
          <ProposerFilterDropdown
            value={proposerFilter}
            members={members}
            onChange={(v) => {
              setProposerFilter(v);
              setPage(1);
            }}
          />
        </div>

        {/* ── Table ── */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="loading loading-spinner" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 space-y-1">
            <p className="text-base-content/50 text-sm">
              No change requests found
            </p>
            {(debouncedSearch || proposerFilter !== "all") && (
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => {
                  setSearch("");
                  setProposerFilter("all");
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <CRTable
            items={items}
            orgId={orgId}
            projectId={projectId}
            members={members}
            showTask
            canReview={policies.canReview}
            onRefresh={fetchCRs}
            onItemUpdate={handleItemUpdate}
          />
        )}

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-base-200">
            <span className="text-xs text-base-content/50">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}{" "}
              of {total}
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="xs"
                variant="ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Prev
              </Button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const p =
                  totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page + i - 3;
                if (p < 1 || p > totalPages) return null;
                return (
                  <button
                    key={p}
                    className={cn(
                      "btn btn-xs btn-square",
                      p === page ? "btn-primary" : "btn-ghost",
                    )}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                );
              })}
              <Button
                size="xs"
                variant="ghost"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next →
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   CRTable — wraps rows in a proper <table>
   ═══════════════════════════════════════════════════════ */

function CRTable({
  items,
  orgId,
  projectId,
  members,
  showTask,
  canReview,
  onRefresh,
  onItemUpdate,
}: {
  items: TaskChangeRequest[];
  orgId: string;
  projectId: string;
  members: OrgMember[];
  showTask?: boolean;
  canReview?: boolean;
  onRefresh?: () => void;
  onItemUpdate?: (id: string, patch: Partial<TaskChangeRequest>) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-base-200">
      <table className="table table-xs w-full">
        <thead>
          <tr className="text-xs text-base-content/50 border-b border-base-200">
            <th className="py-2 pl-3">Proposer</th>
            <th className="py-2">Fields</th>
            {showTask && <th className="py-2">Task</th>}
            <th className="py-2">Reason</th>
            <th className="py-2">Date</th>
            <th className="py-2">Status</th>
            <th className="py-2 pr-3"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((cr) => (
            <ChangeRequestRow
              key={cr.id}
              cr={cr}
              orgId={orgId}
              projectId={projectId}
              members={members}
              showTask={showTask}
              canReview={canReview}
              onRefresh={onRefresh}
              onItemUpdate={onItemUpdate}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Single Change Request Row with Approve/Reject
   ═══════════════════════════════════════════════════════ */

function ChangeRequestRow({
  cr,
  orgId,
  projectId: _projectId,
  members,
  showTask,
  canReview,
  onRefresh,
  onItemUpdate,
}: {
  cr: TaskChangeRequest;
  orgId: string;
  projectId: string;
  members: OrgMember[];
  showTask?: boolean;
  canReview?: boolean;
  onRefresh?: () => void;
  onItemUpdate?: (id: string, patch: Partial<TaskChangeRequest>) => void;
}) {
  const send = useProjectTaskStore((s) => s.send);
  const [detailOpen, setDetailOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [approvePending, setApprovePending] = useState(false);
  const [rejectPending, setRejectPending] = useState(false);

  const handleApprove = async (note: string) => {
    if (!send) return;
    setApprovePending(true);
    try {
      await send("cr:approve", { id: cr.id, note: note || undefined });
      // Optimistic update — avoids dirty read from immediate re-fetch
      onItemUpdate?.(cr.id, { status: "approved" });
      setDetailOpen(false);
      setReviewNote("");
      // Delay background re-fetch to let the backend commit propagate
      setTimeout(() => onRefresh?.(), 600);
    } catch {
    } finally {
      setApprovePending(false);
    }
  };

  const handleReject = async (note: string) => {
    if (!send) return;
    setRejectPending(true);
    try {
      await send("cr:reject", { id: cr.id, note: note || undefined });
      // Optimistic update — avoids dirty read from immediate re-fetch
      onItemUpdate?.(cr.id, { status: "rejected" });
      setDetailOpen(false);
      setReviewNote("");
      // Delay background re-fetch to let the backend commit propagate
      setTimeout(() => onRefresh?.(), 600);
    } catch {
    } finally {
      setRejectPending(false);
    }
  };

  const proposer = members.find((m) => m.user_id === cr.proposer_id);
  const reviewer = cr.reviewer_id
    ? members.find((m) => m.user_id === cr.reviewer_id)
    : null;

  const statusBadge = {
    pending: <Badge variant="warning">Pending</Badge>,
    approved: <Badge variant="success">Approved</Badge>,
    rejected: <Badge variant="error">Rejected</Badge>,
  };

  const changes = cr.changes || {};

  return (
    <>
      {/* Compact table row — click to open detail popup */}
      <tr
        className="hover:bg-base-200/50 cursor-pointer border-b border-base-200 last:border-0"
        onClick={() => setDetailOpen(true)}
      >
        <td className="py-2 pl-3">
          <div className="flex items-center gap-1.5 min-w-0">
            <Avatar
              name={proposer?.display_name || "?"}
              src={proposer?.avatar_url}
              size="xs"
            />
            <span className="text-xs font-medium truncate max-w-[90px]">
              {proposer?.display_name ||
                proposer?.email ||
                cr.proposer_id.slice(0, 8)}
            </span>
          </div>
        </td>
        <td className="py-2">
          <div className="flex flex-wrap gap-0.5">
            {Object.keys(changes).map((field) => (
              <span
                key={field}
                className="badge badge-ghost badge-xs font-mono"
              >
                {FIELD_LABELS[field] || field}
              </span>
            ))}
          </div>
        </td>
        {showTask && (
          <td className="py-2 text-xs text-base-content/60">
            {cr.task_id ? cr.task_id.slice(0, 8) : "—"}
          </td>
        )}
        <td className="py-2 max-w-[120px]">
          <span className="text-xs text-base-content/60 line-clamp-1">
            {cr.reason || <span className="text-base-content/30">—</span>}
          </span>
        </td>
        <td className="py-2 text-xs text-base-content/50 whitespace-nowrap">
          {formatRelative(cr.created_at)}
        </td>
        <td className="py-2">{statusBadge[cr.status]}</td>
        <td className="py-2 pr-3" />
      </tr>

      {/* ── Detail / Review popup ── */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title="Change Request"
        className="max-w-xl"
      >
        <div className="space-y-5">
          {/* Header meta */}
          <div className="flex items-center gap-3">
            <Avatar
              name={proposer?.display_name || "?"}
              src={proposer?.avatar_url}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {proposer?.display_name ||
                  proposer?.email ||
                  cr.proposer_id.slice(0, 8)}
              </p>
              <p className="text-xs text-base-content/50">
                {formatRelative(cr.created_at)}
                {showTask && cr.task_id && (
                  <span> · Task {cr.task_id.slice(0, 8)}</span>
                )}
              </p>
            </div>
            {statusBadge[cr.status]}
          </div>

          {/* Proposed changes table */}
          <div>
            <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-2">
              Proposed Changes
            </p>
            <div className="overflow-x-auto rounded-lg border border-base-200">
              <table className="table table-sm w-full">
                <thead>
                  <tr className="text-xs text-base-content/40">
                    <th className="font-medium">Field</th>
                    <th className="font-medium">New Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(changes).map(([field, value]) => (
                    <tr key={field} className="border-t border-base-200">
                      <td className="text-xs font-medium text-base-content/70 py-1.5">
                        {FIELD_LABELS[field] || field}
                      </td>
                      <td className="text-xs py-1.5">
                        {formatFieldValue(field, value, members)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Reason */}
          {cr.reason && (
            <div>
              <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-1">
                Reason
              </p>
              <p className="text-sm text-base-content/80 bg-base-200/60 rounded-lg px-3 py-2 italic">
                &ldquo;{cr.reason}&rdquo;
              </p>
            </div>
          )}

          {/* Reviewer note (resolved) */}
          {cr.review_note && (
            <div>
              <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-1">
                Review Note
                {reviewer && (
                  <span className="normal-case font-normal ml-1">
                    — {reviewer.display_name || reviewer.email}
                  </span>
                )}
              </p>
              <p className="text-sm text-base-content/80 bg-base-200/60 rounded-lg px-3 py-2 italic">
                &ldquo;{cr.review_note}&rdquo;
              </p>
            </div>
          )}

          {/* Attachments with media preview */}
          <CRDetailAttachments orgId={orgId} crId={cr.id} />

          {/* Review actions (only for pending + canReview) */}
          {cr.status === "pending" && canReview && (
            <div className="space-y-3 border-t border-base-200 pt-4">
              <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wide">
                Your Decision
              </p>
              <Textarea
                label="Review Note (optional)"
                placeholder="Add a note about your decision…"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                rows={2}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setDetailOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="error"
                  onClick={() => handleReject(reviewNote)}
                  loading={rejectPending}
                >
                  <X className="w-4 h-4 mr-1" /> Reject
                </Button>
                <Button
                  onClick={() => handleApprove(reviewNote)}
                  loading={approvePending}
                >
                  <Check className="w-4 h-4 mr-1" /> Approve
                </Button>
              </div>
            </div>
          )}

          {/* Close button for resolved CRs */}
          {cr.status !== "pending" && (
            <div className="flex justify-end pt-2">
              <Button variant="ghost" onClick={() => setDetailOpen(false)}>
                Close
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   Attachments section inside the detail popup modal.
   Shows image previews for image MIME types; file list
   for everything else. Supports upload + delete.
   ═══════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════
   Per-attachment media preview tile.
   Fetches content through the backend (no MinIO CORS) and
   renders inline. Same pattern as AttachmentPreview in
   task-preview-panel.tsx
   ═══════════════════════════════════════════════════════ */

function CRAttachmentPreview({
  orgId,
  crId,
  attachment,
  onOpen,
}: {
  orgId: string;
  crId: string;
  attachment: Attachment;
  onOpen: (blobUrl: string) => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.changeRequests.attachments
      .fetchBlobUrl(orgId, crId, attachment.id)
      .then((url) => {
        if (!cancelled) {
          setBlobUrl(url);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, crId, attachment.id]);

  if (loading) {
    return (
      <div className="w-full h-32 rounded-lg bg-base-300 animate-pulse flex items-center justify-center">
        <span className="loading loading-spinner loading-sm" />
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div className="w-full h-32 rounded-lg bg-base-300 flex items-center justify-center text-xs text-base-content/40">
        Preview unavailable
      </div>
    );
  }

  if (attachment.mime_type.startsWith("video/")) {
    return (
      <video
        src={blobUrl}
        controls
        className="w-full max-h-[200px] rounded-lg object-contain bg-black"
        preload="metadata"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={blobUrl}
      alt={attachment.filename}
      className="w-full max-h-[200px] rounded-lg object-contain cursor-pointer"
      loading="lazy"
      onClick={() => onOpen(blobUrl)}
    />
  );
}

/* ═══════════════════════════════════════════════════════
   Attachments section inside the detail popup modal.
   Media (images / videos) rendered inline via backend.
   Non-media shown as a download list.
   ═══════════════════════════════════════════════════════ */

function CRDetailAttachments({ orgId, crId }: { orgId: string; crId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [items, setItems] = useState<Attachment[]>([]);
  // Lightbox
  const [lightbox, setLightbox] = useState<{
    url: string;
    name: string;
    mime: string;
  } | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const data = await api.changeRequests.attachments.list(orgId, crId);
      setItems(data?.data || []);
    } catch {}
  }, [orgId, crId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleDelete = async (id: string) => {
    try {
      await api.changeRequests.attachments.delete(orgId, crId, id);
      fetchItems();
    } catch {}
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.changeRequests.attachments.directUpload(orgId, crId, file);
      fetchItems();
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDownload = async (att: Attachment) => {
    setLoadingId(att.id);
    try {
      const blobUrl = await api.changeRequests.attachments.fetchBlobUrl(
        orgId,
        crId,
        att.id,
      );
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = att.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } finally {
      setLoadingId(null);
    }
  };

  const handleOpenLightbox = async (att: Attachment) => {
    setLoadingId(att.id);
    try {
      const blobUrl = await api.changeRequests.attachments.fetchBlobUrl(
        orgId,
        crId,
        att.id,
      );
      setLightbox({ url: blobUrl, name: att.filename, mime: att.mime_type });
    } finally {
      setLoadingId(null);
    }
  };

  const isMedia = (mime: string) =>
    mime.startsWith("image/") || mime.startsWith("video/");

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const fileIcon = (mime: string) => {
    if (mime.startsWith("image/"))
      return <ImageIcon className="w-3.5 h-3.5 text-primary" />;
    if (mime.startsWith("video/"))
      return <Play className="w-3.5 h-3.5 text-secondary" />;
    if (mime === "application/pdf")
      return <FileText className="w-3.5 h-3.5 text-error" />;
    return <Paperclip className="w-3.5 h-3.5 text-base-content/40" />;
  };

  const mediaItems = items.filter((a) => isMedia(a.mime_type));
  const fileItems = items.filter((a) => !isMedia(a.mime_type));

  return (
    <>
      {/* Section header */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wide flex items-center gap-1">
          <Paperclip className="w-3 h-3" />
          Attachments{items.length > 0 && ` (${items.length})`}
        </p>
        <label
          className={cn(
            "btn btn-ghost btn-xs gap-1 cursor-pointer",
            uploading && "loading",
          )}
        >
          <Upload className="w-3 h-3" />
          {uploading ? "Uploading…" : "Attach"}
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      </div>

      {items.length === 0 && (
        <p className="text-xs text-base-content/40">No attachments</p>
      )}

      {/* ── Media grid (images & videos) ── */}
      {mediaItems.length > 0 && (
        <div className="space-y-1.5 mb-3">
          <p className="text-xs text-base-content/40 font-medium">
            Media ({mediaItems.length})
          </p>
          <div className="grid grid-cols-2 gap-2">
            {mediaItems.map((att) => (
              <div
                key={att.id}
                className="relative group rounded-lg overflow-hidden border border-base-200 hover:border-primary/40 transition-colors"
              >
                <CRAttachmentPreview
                  orgId={orgId}
                  crId={crId}
                  attachment={att}
                  onOpen={(url) =>
                    setLightbox({
                      url,
                      name: att.filename,
                      mime: att.mime_type,
                    })
                  }
                />
                {/* Gradient overlay with filename + size */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <p className="text-xs text-white truncate">{att.filename}</p>
                  <p className="text-[10px] text-white/70">
                    {formatSize(att.file_size)}
                  </p>
                </div>
                {/* Action buttons overlay */}
                <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    className="btn btn-ghost btn-xs btn-square bg-black/40 text-white hover:bg-black/60"
                    onClick={() => handleOpenLightbox(att)}
                    disabled={loadingId === att.id}
                    title="Preview"
                  >
                    <ImageIcon className="w-3 h-3" />
                  </button>
                  <button
                    className="btn btn-ghost btn-xs btn-square bg-black/40 text-white hover:bg-black/60"
                    onClick={() => handleDownload(att)}
                    disabled={loadingId === att.id}
                    title="Download"
                  >
                    <Download className="w-3 h-3" />
                  </button>
                  <button
                    className="btn btn-ghost btn-xs btn-square bg-black/40 text-error hover:bg-black/60"
                    onClick={() => handleDelete(att.id)}
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Non-media files ── */}
      {fileItems.length > 0 && (
        <div className="space-y-1">
          {fileItems.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-2 p-1.5 rounded-lg border border-base-200 hover:bg-base-200/50 group text-xs"
            >
              {fileIcon(att.mime_type)}
              <span className="flex-1 truncate">{att.filename}</span>
              <span className="text-base-content/40 shrink-0">
                {formatSize(att.file_size)}
              </span>
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
                  onClick={() => handleDelete(att.id)}
                  title="Delete"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightbox && (
        <Modal
          open={!!lightbox}
          onClose={() => {
            URL.revokeObjectURL(lightbox.url);
            setLightbox(null);
          }}
          title={lightbox.name}
          className="max-w-3xl"
        >
          <div className="flex items-center justify-center bg-base-300 rounded-lg overflow-hidden">
            {lightbox.mime.startsWith("video/") ? (
              <video
                src={lightbox.url}
                controls
                autoPlay
                className="max-w-full max-h-[70vh] object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lightbox.url}
                alt={lightbox.name}
                className="max-w-full max-h-[70vh] object-contain"
              />
            )}
          </div>
          <div className="flex justify-between items-center mt-3">
            <span className="text-xs text-base-content/50">
              {lightbox.name}
            </span>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                const a = document.createElement("a");
                a.href = lightbox.url;
                a.download = lightbox.name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }}
            >
              <Download className="w-3.5 h-3.5 mr-1" /> Download
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   Pending Review Indicator (badge for task cards)
   ═══════════════════════════════════════════════════════ */

export function PendingReviewBadge({ count }: { count?: number }) {
  if (!count || count <= 0) return null;
  return (
    <span
      className="badge badge-warning badge-sm gap-1"
      title={`${count} pending change request(s)`}
    >
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
  onViewApprovals,
}: {
  result: {
    pending_review?: boolean;
    change_request?: TaskChangeRequest | null;
  } | null;
  onDismiss: () => void;
  onViewApprovals?: () => void;
}) {
  if (!result?.pending_review || !result.change_request) return null;

  const fields = Object.keys(result.change_request.changes || {});

  return (
    <div className="alert alert-warning shadow-lg mb-4">
      <AlertCircle className="w-5 h-5" />
      <div>
        <h4 className="font-bold text-sm">Changes Pending Review</h4>
        <p className="text-xs">
          Your changes to <strong>{fields.join(", ")}</strong> require approval
          before being applied.
        </p>
      </div>
      <div className="flex gap-1">
        {onViewApprovals && (
          <button className="btn btn-ghost btn-xs" onClick={onViewApprovals}>
            <Paperclip className="w-3 h-3 mr-1" /> View & Attach
          </button>
        )}
        <button className="btn btn-ghost btn-xs" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
