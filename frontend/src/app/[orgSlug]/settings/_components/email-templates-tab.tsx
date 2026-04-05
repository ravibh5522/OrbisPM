"use client";

import { useEmailEditor } from "@/components/email-editor-wrapper";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form-fields";
import { Modal } from "@/components/ui/modal";
import { Badge, ConfirmDialog, LoadingPage } from "@/components/ui/shared";
import { Tabs } from "@/components/ui/tabs";
import { api, ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ClipboardCheck,
  Code2,
  Eye,
  KeyRound,
  LayoutTemplate,
  Mail,
  Megaphone,
  PartyPopper,
  Pencil,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const DEFAULT_TEMPLATES = [
  {
    name: "notification",
    label: "Notification",
    description: "General notification emails sent to project members",
    icon: Mail,
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    name: "password_reset",
    label: "Password Reset",
    description: "Sent when a user requests a password reset link",
    icon: KeyRound,
    color: "text-warning",
    bg: "bg-warning/10",
  },
  {
    name: "otp",
    label: "OTP / Verification",
    description: "One-time passcode and account verification emails",
    icon: ShieldCheck,
    color: "text-success",
    bg: "bg-success/10",
  },
  {
    name: "announcement",
    label: "Announcement",
    description: "Emailed copies of organization announcements",
    icon: Megaphone,
    color: "text-secondary",
    bg: "bg-secondary/10",
  },
  {
    name: "welcome",
    label: "Welcome",
    description: "Sent to new users when they join the organization",
    icon: PartyPopper,
    color: "text-accent",
    bg: "bg-accent/10",
  },
  {
    name: "change_request_review",
    label: "CR — Review",
    description: "Sent to reviewers when a change request needs approval",
    icon: ClipboardCheck,
    color: "text-info",
    bg: "bg-info/10",
  },
  {
    name: "change_request_approved",
    label: "CR — Approved",
    description: "Sent to requester when a change request is approved",
    icon: CheckCircle2,
    color: "text-success",
    bg: "bg-success/10",
  },
  {
    name: "change_request_rejected",
    label: "CR — Rejected",
    description: "Sent to requester when a change request is rejected",
    icon: XCircle,
    color: "text-error",
    bg: "bg-error/10",
  },
];

const SAMPLE_CONTEXT: Record<string, Record<string, string>> = {
  notification: {
    title: "New task assigned",
    body: "You have been assigned to task: Design landing page",
  },
  password_reset: {
    reset_url: "#",
    reset_code: "847291",
  },
  otp: { otp_code: "529384" },
  announcement: {
    title: "Team All-Hands Meeting",
    body: "Please join us this Friday at 3 PM for our quarterly all-hands meeting.",
    author_name: "Admin",
    priority: "high",
  },
  welcome: { user_name: "John Doe" },
  change_request_review: {
    task_title: "Redesign landing page hero section",
    requester_name: "Jane Smith",
    reason: "The hero needs a refresh before the Q4 launch.",
    review_url: "#",
  },
  change_request_approved: {
    task_title: "Redesign landing page hero section",
    reviewer_name: "Alice Manager",
    note: "Looks good, approved for implementation.",
    task_url: "#",
  },
  change_request_rejected: {
    task_title: "Redesign landing page hero section",
    reviewer_name: "Alice Manager",
    note: "The proposed changes conflict with brand guidelines.",
    task_url: "#",
  },
};

const GLOBAL_VARS = ["app_name", "frontend_url"];

type EditorMode = "visual" | "code";

/** Render sample variables into HTML for preview */
function renderPreview(html: string, name: string): string {
  const context = SAMPLE_CONTEXT[name] || {
    title: "Preview",
    body: "This is a preview.",
  };
  let out = html;
  for (const [key, value] of Object.entries({
    ...context,
    app_name: "OrbisPM",
    frontend_url: "#",
  })) {
    out = out.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"), value);
  }
  out = out.replace(/\{%[\s\S]*?%\}/g, "");
  out = out.replace(/\{\{.*?\}\}/g, "");
  return out;
}

/** Thumbnail — iframe fills card width, top portion visible, bottom clipped */
function EmailThumbnail({ html, name }: { html: string; name: string }) {
  const rendered = renderPreview(html, name);
  return (
    <div
      className="w-full overflow-hidden rounded-lg border border-base-200"
      style={{ height: 180 }}
    >
      <iframe
        srcDoc={rendered}
        title={`${name} preview`}
        sandbox=""
        className="w-full border-0 pointer-events-none block"
        style={{ height: 600 }}
      />
    </div>
  );
}

// ── Template Editor Modal ─────────────────────────────────────────────────────
// This component is intentionally separated so that useEmailEditor (and thus
// TinyMCE's onInit) runs inside a component that is mounted only when a
// template is being edited. key={templateName} in the parent ensures a fresh
// mount whenever a different template is opened.

interface TemplateEditorModalProps {
  templateName: string;
  initialHtml: string;
  initialMode: EditorMode;
  templateMeta: (typeof DEFAULT_TEMPLATES)[0] | undefined;
  orgId: string;
  onSaved: () => void;
  onClose: () => void;
}

function TemplateEditorModal({
  templateName,
  initialHtml,
  initialMode,
  templateMeta,
  orgId,
  onSaved,
  onClose,
}: TemplateEditorModalProps) {
  const qc = useQueryClient();
  const [editorMode, setEditorMode] = useState<EditorMode>(initialMode);
  const [editHtml, setEditHtml] = useState(initialHtml);
  const [error, setError] = useState("");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  // Hook is called here — component only mounts when the editor should be open,
  // so onInit fires with the correct initialHtml every time.
  const { EditorComponent, exportTemplate, setContent } = useEmailEditor({
    initialHtml,
    minHeight: 560,
  });

  const templateVars = Object.keys(SAMPLE_CONTEXT[templateName] || {});

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editorMode === "visual") {
        const { html } = await exportTemplate();
        return api.emailTemplates.upsert(orgId, templateName, html, null);
      }
      return api.emailTemplates.upsert(orgId, templateName, editHtml, null);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      onSaved();
      toast.success("Template saved");
    },
    onError: (e: Error) =>
      setError(e instanceof ApiError ? e.message : "Failed to save template"),
  });

  const handleModeSwitch = async (newMode: EditorMode) => {
    if (newMode === editorMode) return;
    if (editorMode === "visual" && newMode === "code") {
      try {
        const { html } = await exportTemplate();
        setEditHtml(html);
      } catch {
        /* keep current editHtml */
      }
    } else if (editorMode === "code" && newMode === "visual") {
      // Push code-editor changes back into TinyMCE
      setContent(editHtml);
    }
    setEditorMode(newMode);
  };

  const handlePreview = async () => {
    try {
      const html =
        editorMode === "visual" ? (await exportTemplate()).html : editHtml;
      setPreviewHtml(renderPreview(html, templateName));
    } catch {
      setError("Failed to generate preview");
    }
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`Edit: ${templateMeta?.label || templateName}`}
        className="max-w-6xl"
      >
        {error && (
          <Alert variant="error" className="mb-4">
            {error}
          </Alert>
        )}
        <div className="space-y-4">
          {/* Mode tabs */}
          <Tabs
            tabs={[
              {
                id: "visual",
                label: "Visual",
                icon: <LayoutTemplate className="w-3.5 h-3.5" />,
              },
              {
                id: "code",
                label: "Code",
                icon: <Code2 className="w-3.5 h-3.5" />,
              },
            ]}
            activeTab={editorMode}
            onChange={(id) => handleModeSwitch(id as "visual" | "code")}
            variant="boxed"
            size="sm"
            className="w-fit"
          />

          {/* Variables hint */}
          <div className="rounded-xl bg-base-200/70 border border-base-300 px-4 py-3">
            <p className="text-xs font-semibold text-base-content/60 mb-1.5 uppercase tracking-wide">
              Available Variables
            </p>
            {editorMode === "visual" && (
              <p className="text-xs text-base-content/50 mb-2">
                Use the <strong>Merge Tags</strong> button in the toolbar to
                insert these variables.
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {[...templateVars, ...GLOBAL_VARS].map((v) => (
                <code
                  key={v}
                  className="badge badge-xs badge-outline font-mono text-[10px] px-1.5"
                >
                  {editorMode === "code" ? `{{ ${v} }}` : v.replace(/_/g, " ")}
                </code>
              ))}
            </div>
          </div>

          {/* Editor area */}
          {editorMode === "visual" ? (
            <div className="rounded-xl overflow-hidden border border-base-200">
              {EditorComponent}
            </div>
          ) : (
            <div className="form-control">
              <label className="label pb-1">
                <span className="label-text font-semibold text-sm">
                  HTML Template
                </span>
                <span className="label-text-alt text-base-content/40 text-xs">
                  Jinja2 syntax supported
                </span>
              </label>
              <Textarea
                className="font-mono text-xs leading-relaxed resize-y"
                rows={22}
                value={editHtml}
                onChange={(e) => setEditHtml(e.target.value)}
                placeholder="Enter your HTML email template…"
                spellCheck={false}
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <Button variant="ghost" size="sm" onClick={handlePreview}>
              <Eye className="w-4 h-4" /> Preview
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                loading={saveMutation.isPending}
              >
                Save Template
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* In-editor preview modal */}
      <Modal
        open={!!previewHtml}
        onClose={() => setPreviewHtml(null)}
        title={`Preview: ${templateMeta?.label || "Email"}`}
        className="max-w-2xl"
      >
        {previewHtml && (
          <div className="rounded-xl overflow-hidden border border-base-200 bg-white shadow-inner">
            <iframe
              srcDoc={previewHtml}
              className="w-full border-0"
              style={{ minHeight: 520 }}
              title="Email preview"
              sandbox=""
            />
          </div>
        )}
      </Modal>
    </>
  );
}

// ── Main Tab ──────────────────────────────────────────────────────────────────

export default function EmailTemplatesTab() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const qc = useQueryClient();

  // Editor open state — set after fetching the template HTML
  const [editTemplate, setEditTemplate] = useState<string | null>(null);
  const [editInitialHtml, setEditInitialHtml] = useState("");
  const [editInitialMode, setEditInitialMode] = useState<EditorMode>("visual");

  // Card-level full preview
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<string | null>(null);

  // Reset confirm
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: customTemplates, isLoading } = useQuery({
    queryKey: ["email-templates", currentOrg?.id],
    queryFn: () => api.emailTemplates.listCustom(currentOrg!.id),
    enabled: !!currentOrg,
  });

  const customList = customTemplates?.templates || [];

  const deleteMutation = useMutation({
    mutationFn: (name: string) =>
      api.emailTemplates.delete(currentOrg!.id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      setDeleteTarget(null);
      toast.success("Template reset to default");
    },
  });

  const fetchTemplateHtml = async (name: string): Promise<string> => {
    if (!customList.includes(name)) return getStarterTemplate(name);
    try {
      const data = await api.emailTemplates.get(currentOrg!.id, name);
      return data.html;
    } catch {
      return getStarterTemplate(name);
    }
  };

  const openEditor = async (name: string, mode: EditorMode) => {
    const html = await fetchTemplateHtml(name);
    setEditInitialHtml(html);
    setEditInitialMode(mode);
    setEditTemplate(name);
  };

  const openPreview = async (name: string) => {
    const html = await fetchTemplateHtml(name);
    setPreviewHtml(renderPreview(html, name));
    setPreviewTemplate(name);
  };

  const closeEditor = () => setEditTemplate(null);

  if (isLoading) return <LoadingPage />;

  const editingMeta = DEFAULT_TEMPLATES.find((t) => t.name === editTemplate);
  const previewMeta = DEFAULT_TEMPLATES.find((t) => t.name === previewTemplate);

  return (
    <div>
      {/* Description */}
      <div className="mb-6">
        <p className="text-sm text-base-content/60">
          Customize email templates sent to your organization members. Click a
          card to edit, or hover for quick actions. Use{" "}
          <strong>Visual Editor</strong> for rich-text design or{" "}
          <strong>Code Editor</strong> for HTML with{" "}
          <a
            href="https://jinja.palletsprojects.com/en/3.1.x/templates/"
            target="_blank"
            rel="noopener noreferrer"
            className="link link-primary"
          >
            Jinja2
          </a>{" "}
          syntax.
        </p>
      </div>

      {/* 3-column card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {DEFAULT_TEMPLATES.map((tmpl) => {
          const hasCustom = customList.includes(tmpl.name);
          const Icon = tmpl.icon;
          return (
            <div
              key={tmpl.name}
              className="group card bg-base-100 border border-base-200 shadow-sm hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer flex flex-col"
              onClick={() => openEditor(tmpl.name, "visual")}
            >
              {/* Email thumbnail preview */}
              <div className="px-4 pt-4 pb-0">
                <EmailThumbnail
                  html={getStarterTemplate(tmpl.name)}
                  name={tmpl.name}
                />
              </div>

              <div className="card-body pt-3 pb-4 gap-3">
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg ${tmpl.bg} flex items-center justify-center shrink-0`}
                    >
                      <Icon className={`w-4 h-4 ${tmpl.color}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">
                        {tmpl.label}
                      </p>
                      <p className="text-xs text-base-content/50 truncate mt-0.5">
                        {tmpl.description}
                      </p>
                    </div>
                  </div>
                  {hasCustom ? (
                    <Badge variant="badge-success badge-sm">Customized</Badge>
                  ) : (
                    <Badge variant="badge-ghost badge-sm">Default</Badge>
                  )}
                </div>

                {/* Action row */}
                <div
                  className="flex items-center gap-1.5 pt-1 border-t border-base-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="btn btn-ghost btn-xs gap-1 flex-1"
                    onClick={() => openPreview(tmpl.name)}
                    title="Full preview"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Preview
                  </button>
                  <button
                    className="btn btn-ghost btn-xs gap-1 flex-1"
                    onClick={() => openEditor(tmpl.name, "visual")}
                    title="Edit with visual editor"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    className="btn btn-ghost btn-xs gap-1 flex-1"
                    onClick={() => openEditor(tmpl.name, "code")}
                    title="Edit HTML"
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    HTML
                  </button>
                  {hasCustom && (
                    <button
                      className="btn btn-ghost btn-xs btn-square text-error"
                      onClick={() => setDeleteTarget(tmpl.name)}
                      title="Reset to default"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Template editor — mounts fresh per template, TinyMCE gets correct initialHtml */}
      {editTemplate && (
        <TemplateEditorModal
          key={editTemplate}
          templateName={editTemplate}
          initialHtml={editInitialHtml}
          initialMode={editInitialMode}
          templateMeta={editingMeta}
          orgId={currentOrg!.id}
          onSaved={closeEditor}
          onClose={closeEditor}
        />
      )}

      {/* Card-level full preview modal */}
      <Modal
        open={!!previewHtml}
        onClose={() => {
          setPreviewHtml(null);
          setPreviewTemplate(null);
        }}
        title={`Preview: ${previewMeta?.label || "Email"}`}
        className="max-w-2xl"
      >
        {previewHtml && (
          <div className="rounded-xl overflow-hidden border border-base-200 bg-white shadow-inner">
            <iframe
              srcDoc={previewHtml}
              className="w-full border-0"
              style={{ minHeight: 520 }}
              title="Email preview"
              sandbox=""
            />
          </div>
        )}
      </Modal>

      {/* Reset confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        title="Reset to Default"
        message="Reset this template to the built-in default? Your customized version will be permanently deleted."
        confirmLabel="Reset"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

function getStarterTemplate(name: string): string {
  const ctx = SAMPLE_CONTEXT[name] || {};
  const title = ctx.title || "Notification";
  const body =
    ctx.body || "This is a sample email body for the template preview.";
  const extra = (() => {
    if (name === "password_reset")
      return `<a href="#" class="btn">Reset Password</a><p style="margin-top:16px;font-size:13px;color:#71717a;">Or use code: <strong>${ctx.reset_code || "123456"}</strong></p>`;
    if (name === "otp")
      return `<div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#6366f1;text-align:center;padding:16px 0;">${ctx.otp_code || "000000"}</div>`;
    if (name === "welcome")
      return `<p>Welcome aboard, <strong>${ctx.user_name || "User"}</strong>! We're glad to have you.</p><a href="#" class="btn">Get Started</a>`;
    if (name === "announcement")
      return `<div style="display:inline-block;padding:4px 10px;border-radius:99px;background:#fef3c7;color:#92400e;font-size:12px;font-weight:600;margin-bottom:12px;">${ctx.priority?.toUpperCase() || "NORMAL"}</div>`;
    if (name === "change_request_review")
      return `<p><strong>Task:</strong> ${ctx.task_title || "Task title"}</p><p><strong>Requested by:</strong> ${ctx.requester_name || "User"}</p><p><em>${ctx.reason || ""}</em></p><a href="#" class="btn">Review</a>`;
    if (name === "change_request_approved")
      return `<p style="color:#15803d;font-weight:600;">✓ Your change request was approved</p><p><strong>Reviewer note:</strong> ${ctx.note || ""}</p><a href="#" class="btn">View Task</a>`;
    if (name === "change_request_rejected")
      return `<p style="color:#dc2626;font-weight:600;">✗ Your change request was rejected</p><p><strong>Reviewer note:</strong> ${ctx.note || ""}</p><a href="#" class="btn">View Task</a>`;
    return `<a href="#" class="btn">Open OrbisPM</a>`;
  })();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;background:#f4f4f5}
.wrap{max-width:600px;margin:0 auto;padding:32px 16px}
.card{background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.logo{color:#6366f1;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:24px}
h1{font-size:20px;color:#18181b;margin:0 0 12px;font-weight:600}
p{font-size:15px;color:#52525b;line-height:1.7;margin:0 0 16px}
.btn{display:inline-block;padding:11px 26px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:500}
.footer{margin-top:28px;text-align:center;font-size:12px;color:#a1a1aa}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="logo">OrbisPM</div>
    <h1>${title}</h1>
    <p>${body}</p>
    ${extra}
  </div>
  <div class="footer">© OrbisPM · <a href="#" style="color:#a1a1aa">Unsubscribe</a></div>
</div>
</body>
</html>`;
}
