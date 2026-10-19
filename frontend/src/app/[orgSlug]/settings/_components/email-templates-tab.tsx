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
  AtSign,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  Eye,
  KeyRound,
  LayoutTemplate,
  Loader2,
  Mail,
  Megaphone,
  Monitor,
  PartyPopper,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  XCircle,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
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
    name: "mention",
    label: "Mention",
    description: "Sent when a user is @mentioned in a comment or task",
    icon: AtSign,
    color: "text-info",
    bg: "bg-info/10",
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

/** Realistic sample data for every template, covering all template variables */
const PREVIEW_CONTEXT: Record<string, Record<string, string>> = {
  notification: {
    title: "New task assigned to you",
    body: 'You have been assigned to "Design system overhaul" in Project Alpha. The task deadline is Friday, April 10.',
    cta_text: "Open Task",
    cta_url: "#",
    org_name: "Orbi Solutions",
    org_icon: "",
  },
  password_reset: {
    reset_url: "#",
    reset_code: "847291",
    expiry_minutes: "30",
    org_name: "Orbi Solutions",
    org_icon: "",
  },
  otp: {
    otp_code: "529 384",
    expiry_minutes: "10",
    org_name: "Orbi Solutions",
    org_icon: "",
  },
  announcement: {
    title: "Team All-Hands Meeting — Q2 2026",
    body: "Please join us this Friday at 3 PM for our quarterly all-hands meeting. We'll be sharing Q2 roadmap updates, celebrating team wins, and aligning on OKRs for Q3.",
    author_name: "Sarah Mitchell",
    priority: "high",
    org_name: "Orbi Solutions",
    org_icon: "",
  },
  welcome: {
    user_name: "Alex Johnson",
    org_name: "Orbi Solutions",
    org_icon: "",
  },
  mention: {
    title: "Alex mentioned you in #design-team",
    body: "@you Hey, could you review the updated mockups and share your feedback? We're aiming to finalize the designs by end of day.",
    sender_name: "Alex Johnson",
    channel_name: "design-team",
    cta_url: "#",
    org_name: "Orbi Solutions",
    org_icon: "",
  },
  change_request_review: {
    task_title: "Redesign landing page hero section",
    requester_name: "Jamie Chen",
    reason:
      "The current hero section doesn't match the new brand guidelines approved in Q1. I've updated the copy and visuals accordingly.",
    review_url: "#",
    org_name: "Orbi Solutions",
    org_icon: "",
  },
  change_request_approved: {
    task_title: "Redesign landing page hero section",
    reviewer_name: "Alice Manager",
    note: "Great work! The design is on-brand and clearly communicates the value proposition. Approved for implementation.",
    task_url: "#",
    org_name: "Orbi Solutions",
    org_icon: "",
  },
  change_request_rejected: {
    task_title: "Redesign landing page hero section",
    reviewer_name: "Alice Manager",
    note: "The proposed changes conflict with brand guidelines established last quarter. Please revise the color palette and typography, then resubmit.",
    task_url: "#",
    org_name: "Orbi Solutions",
    org_icon: "",
  },
};

/** Subject lines shown in the preview email-client chrome */
const PREVIEW_SUBJECT: Record<string, string> = {
  notification: "New task assigned to you — Simplify Projects",
  password_reset: "Reset your Simplify Projects password",
  otp: "Your verification code: 529 384",
  announcement: "Team All-Hands Meeting — Q2 2026",
  welcome: "Welcome to Orbi Solutions — you're in!",
  mention: "Alex Johnson mentioned you in #design-team",
  change_request_review: "Action required: review change request",
  change_request_approved: "Your change request was approved ✓",
  change_request_rejected: "Your change request needs revision",
};

const GLOBAL_VARS = ["app_name", "frontend_url", "org_name", "org_icon"];

/**
 * Evaluate a simple Jinja2 condition against context.
 * Handles: `var`, `not var`, `var == 'x'`, `var != 'x'`
 */
function evalCondition(cond: string, ctx: Record<string, string>): boolean {
  cond = cond.trim();
  if (cond.startsWith("not ")) return !evalCondition(cond.slice(4), ctx);
  const eq = cond.match(/^(\w+)\s*==\s*['"]([^'"]*)['"]/);
  if (eq) return (ctx[eq[1]] ?? "") === eq[2];
  const ne = cond.match(/^(\w+)\s*!=\s*['"]([^'"]*)['"]/);
  if (ne) return (ctx[ne[1]] ?? "") !== ne[2];
  return Boolean(ctx[cond]);
}

/**
 * Lightweight Jinja2 renderer for in-browser preview.
 * Handles: if/elif/else/endif blocks, {{ var }}, {{ var | default(...) }}
 */
function renderPreviewLocal(html: string, ctx: Record<string, string>): string {
  let out = html;

  // Process if/elif/else/endif blocks — up to 6 passes for nested blocks
  for (let pass = 0; pass < 6; pass++) {
    const prev = out;
    out = out.replace(
      /\{%-?\s*if\s+([\s\S]+?)\s*-?%\}([\s\S]*?)\{%-?\s*endif\s*-?%\}/,
      (_, firstCond: string, body: string) => {
        // Split the body by elif/else delimiters, collecting each branch
        const branches: Array<{ cond: string | null; content: string }> = [
          { cond: firstCond.trim(), content: "" },
        ];
        const delimRe = /\{%-?\s*(elif\s+([\s\S]+?)|else)\s*-?%\}/g;
        let cursor = 0;
        let m: RegExpExecArray | null;
        while ((m = delimRe.exec(body)) !== null) {
          branches[branches.length - 1].content = body.slice(cursor, m.index);
          cursor = m.index + m[0].length;
          if (m[1].startsWith("elif")) {
            branches.push({ cond: m[2].trim(), content: "" });
          } else {
            branches.push({ cond: null, content: "" }); // else
          }
        }
        branches[branches.length - 1].content = body.slice(cursor);
        for (const branch of branches) {
          if (branch.cond === null) return branch.content; // else
          if (evalCondition(branch.cond, ctx)) return branch.content;
        }
        return "";
      },
    );
    if (out === prev) break;
  }

  // {{ var | default("x") }} and {{ var | default('x') }}
  out = out.replace(
    /\{\{-?\s*(\w+)\s*\|\s*default\s*\(\s*["']([^"']*?)["']\s*\)\s*-?\}\}/g,
    (_, v: string, d: string) => ctx[v] ?? d,
  );
  // {{ var | default(number) }}
  out = out.replace(
    /\{\{-?\s*(\w+)\s*\|\s*default\s*\(\s*(\d+)\s*\)\s*-?\}\}/g,
    (_, v: string, d: string) => ctx[v] ?? d,
  );
  // {{ var }}
  out = out.replace(/\{\{-?\s*(\w+)\s*-?\}\}/g, (_, v: string) => ctx[v] ?? "");
  // Strip any remaining tags
  out = out.replace(/\{%[\s\S]*?%\}/g, "");
  out = out.replace(/\{\{[\s\S]*?\}\}/g, "");
  return out;
}

/** Build the full context for local preview */
function buildPreviewCtx(
  name: string,
  org?: { name: string; logo_url?: string },
): Record<string, string> {
  return {
    ...(PREVIEW_CONTEXT[name] ?? {}),
    app_name: "Simplify Projects",
    frontend_url: "#",
    ...(org ? { org_name: org.name, org_icon: org.logo_url ?? "" } : {}),
  };
}

/** Render sample variables into HTML for preview (used for in-editor preview) */
function renderPreview(html: string, name: string): string {
  return renderPreviewLocal(html, buildPreviewCtx(name));
}

type EditorMode = "visual" | "code";
type DeviceMode = "desktop" | "mobile";

// ── Shared Email Preview Modal ─────────────────────────────────────────────────
// Renders rendered HTML inside a full-height, auto-sizing iframe with an
// email-client chrome (From / Subject / device toggle).

interface EmailPreviewModalProps {
  open: boolean;
  onClose: () => void;
  html: string | null;
  loading?: boolean;
  templateName: string | null;
}

function EmailPreviewModal({
  open,
  onClose,
  html,
  loading,
  templateName,
}: EmailPreviewModalProps) {
  const [device, setDevice] = useState<DeviceMode>("desktop");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const meta = DEFAULT_TEMPLATES.find((t) => t.name === templateName);

  const autoResize = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const h = iframe.contentDocument?.documentElement?.scrollHeight;
      if (h && h > 0) iframe.style.height = `${h + 2}px`;
    } catch {
      /* cross-origin guard */
    }
  }, []);

  const iframeWidth = device === "mobile" ? 390 : "100%";

  const subject = templateName
    ? (PREVIEW_SUBJECT[templateName] ?? meta?.description ?? "Email preview")
    : "Email preview";
  const fromAddr = `noreply@${(PREVIEW_CONTEXT[templateName ?? ""]?.org_name ?? "orbispm").toLowerCase().replace(/\s+/g, "")}.com`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Preview — ${meta?.label ?? templateName ?? "Email"}`}
      className="max-w-5xl w-full"
    >
      {loading && !html ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-base-content/50">Rendering template…</p>
        </div>
      ) : html ? (
        <div className="flex flex-col gap-0 rounded-xl overflow-hidden border border-base-300 shadow-md">
          {/* Email-client toolbar */}
          <div className="bg-base-200 border-b border-base-300 px-4 py-2.5 flex items-center gap-3">
            {/* macOS traffic lights */}
            <div className="flex gap-1.5 shrink-0">
              <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
              <span className="w-3 h-3 rounded-full bg-[#28c840]" />
            </div>
            {/* Subject line */}
            <div className="flex-1 min-w-0 text-center">
              <span className="text-xs font-medium text-base-content/70 truncate block">
                {subject}
              </span>
            </div>
            {/* Device toggle */}
            <div className="flex items-center gap-0.5 bg-base-300 rounded-lg p-0.5 shrink-0">
              <button
                className={`p-1.5 rounded-md transition-colors ${device === "desktop" ? "bg-base-100 shadow-sm text-base-content" : "text-base-content/40 hover:text-base-content/70"}`}
                onClick={() => setDevice("desktop")}
                title="Desktop view"
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
              <button
                className={`p-1.5 rounded-md transition-colors ${device === "mobile" ? "bg-base-100 shadow-sm text-base-content" : "text-base-content/40 hover:text-base-content/70"}`}
                onClick={() => setDevice("mobile")}
                title="Mobile view (390px)"
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* From / To meta row */}
          <div className="bg-base-100 border-b border-base-200 px-5 py-2 text-xs text-base-content/50 flex gap-6">
            <span>
              <strong className="text-base-content/70">From:</strong>{" "}
              {meta?.label ?? "Simplify Projects"} &lt;{fromAddr}&gt;
            </span>
            <span>
              <strong className="text-base-content/70">To:</strong>{" "}
              alex.johnson@example.com
            </span>
          </div>

          {/* iframe area */}
          <div
            className="bg-[#f0eef9] overflow-auto"
            style={{ maxHeight: "72vh" }}
          >
            <div
              style={{
                width: iframeWidth,
                margin: device === "mobile" ? "0 auto" : undefined,
                transition: "width 0.2s ease",
              }}
            >
              <iframe
                ref={iframeRef}
                srcDoc={html}
                className="w-full border-0 block"
                style={{ height: 720, minHeight: 400 }}
                title="Email preview"
                sandbox="allow-same-origin"
                onLoad={autoResize}
              />
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

/** Thumbnail — iframe fills card width, top portion visible, bottom clipped */
function EmailThumbnail({
  html,
  name,
  loading,
}: {
  html: string;
  name: string;
  loading?: boolean;
}) {
  const rendered = loading ? "" : renderPreview(html, name);
  return (
    <div
      className="w-full overflow-hidden rounded-lg border border-base-200 bg-base-50 relative"
      style={{ height: 180 }}
    >
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-base-100">
          <Loader2 className="w-5 h-5 animate-spin text-base-content/30" />
        </div>
      ) : (
        <iframe
          srcDoc={rendered}
          title={`${name} preview`}
          sandbox=""
          className="w-full border-0 pointer-events-none block"
          style={{ height: 620 }}
        />
      )}
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
  const [previewLoading, setPreviewLoading] = useState(false);

  // Hook is called here — component only mounts when the editor should be open,
  // so onInit fires with the correct initialHtml every time.
  const { EditorComponent, exportTemplate, setContent } = useEmailEditor({
    initialHtml,
    minHeight: 560,
  });

  const templateVars = Object.keys(PREVIEW_CONTEXT[templateName] || {});

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
    setPreviewLoading(true);
    try {
      const html =
        editorMode === "visual" ? (await exportTemplate()).html : editHtml;
      // Try API-rendered preview first (proper Jinja2 rendering)
      try {
        const result = await api.emailTemplates.preview(orgId, {
          template: templateName,
          context: buildPreviewCtx(templateName),
        });
        setPreviewHtml(result.html);
      } catch {
        // Fall back to local rendering
        setPreviewHtml(renderPreview(html, templateName));
      }
    } catch {
      setError("Failed to generate preview");
    } finally {
      setPreviewLoading(false);
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
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePreview}
              loading={previewLoading}
            >
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

      {/* In-editor preview modal — uses shared EmailPreviewModal */}
      <EmailPreviewModal
        open={!!previewHtml}
        onClose={() => setPreviewHtml(null)}
        html={previewHtml}
        loading={previewLoading}
        templateName={templateName}
      />
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
  const [previewLoading, setPreviewLoading] = useState(false);

  // Reset confirm
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: customTemplates, isLoading } = useQuery({
    queryKey: ["email-templates", currentOrg?.id],
    queryFn: () => api.emailTemplates.listCustom(currentOrg!.id),
    enabled: !!currentOrg,
  });

  /** Pre-render all template thumbnails via the email service for accurate previews */
  const { data: previewMap, isLoading: previewMapLoading } = useQuery({
    queryKey: ["email-templates-preview", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return {};
      const results: Record<string, string> = {};
      await Promise.allSettled(
        DEFAULT_TEMPLATES.map(async (t) => {
          try {
            const r = await api.emailTemplates.preview(currentOrg.id, {
              template: t.name,
              context: buildPreviewCtx(t.name, currentOrg),
            });
            results[t.name] = r.html;
          } catch {
            // Fall back to local starter template on error
            results[t.name] = getStarterTemplate(t.name);
          }
        }),
      );
      return results;
    },
    staleTime: 5 * 60 * 1000,
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
    setPreviewLoading(true);
    setPreviewTemplate(name);
    setPreviewHtml(null);
    try {
      // Always use the API for full preview — gives accurate Jinja2 rendering
      const result = await api.emailTemplates.preview(currentOrg!.id, {
        template: name,
        context: buildPreviewCtx(name, currentOrg!),
      });
      setPreviewHtml(result.html);
    } catch {
      // Fall back to local rendering
      const html = await fetchTemplateHtml(name);
      setPreviewHtml(
        renderPreviewLocal(html, buildPreviewCtx(name, currentOrg!)),
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const closeEditor = () => setEditTemplate(null);

  if (isLoading) return <LoadingPage />;

  const editingMeta = DEFAULT_TEMPLATES.find((t) => t.name === editTemplate);

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
                  html={
                    previewMap?.[tmpl.name] ?? getStarterTemplate(tmpl.name)
                  }
                  name={tmpl.name}
                  loading={previewMapLoading && !previewMap?.[tmpl.name]}
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
                    disabled={previewLoading && previewTemplate === tmpl.name}
                  >
                    {previewLoading && previewTemplate === tmpl.name ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
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

      {/* Card-level full preview — uses shared EmailPreviewModal */}
      <EmailPreviewModal
        open={!!previewHtml || (previewLoading && !!previewTemplate)}
        onClose={() => {
          setPreviewHtml(null);
          setPreviewTemplate(null);
          setPreviewLoading(false);
        }}
        html={previewHtml}
        loading={previewLoading}
        templateName={previewTemplate}
      />

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
  const ctx = PREVIEW_CONTEXT[name] ?? {};

  const cardContent = (() => {
    switch (name) {
      case "password_reset":
        return `
          <p style="font-size:15px;color:#4b5563;margin:0 0 20px;line-height:1.7;">
            We received a request to reset the password for your account. Click the button below to choose a new password.
          </p>
          <div style="text-align:center;margin-bottom:20px;">
            <a href="#" style="display:inline-block;padding:13px 32px;background:#d82638;color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;">Reset Password</a>
          </div>
          <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:14px 18px;text-align:center;">
            <p style="margin:0 0 4px;font-size:11px;color:#7c3aed;font-weight:600;text-transform:uppercase;letter-spacing:.8px;">Or use this code</p>
            <span style="font-size:28px;font-weight:800;color:#5b21b6;letter-spacing:10px;font-family:'Courier New',monospace;">${ctx.reset_code ?? "847291"}</span>
          </div>
          <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;text-align:center;">Expires in ${ctx.expiry_minutes ?? "30"} minutes</p>`;
      case "otp":
        return `
          <p style="font-size:15px;color:#4b5563;margin:0 0 20px;line-height:1.7;">
            Use the verification code below to complete your sign-in. This code is valid for ${ctx.expiry_minutes ?? "10"} minutes.
          </p>
          <div style="background:#f5f3ff;border:2px solid #ddd6fe;border-radius:12px;padding:24px;text-align:center;margin-bottom:16px;">
            <span style="font-size:40px;font-weight:800;color:#5b21b6;letter-spacing:14px;font-family:'Courier New',monospace;">${ctx.otp_code ?? "529 384"}</span>
          </div>
          <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">Never share this code with anyone</p>`;
      case "announcement":
        return `
          <div style="display:inline-block;padding:4px 12px;border-radius:99px;background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px;">High Priority</div>
          <p style="font-size:15px;color:#4b5563;margin:0 0 20px;line-height:1.7;">${ctx.body ?? "Please join us this Friday at 3 PM for our quarterly all-hands meeting."}</p>
          <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;">
            <div style="width:32px;height:32px;border-radius:50%;background:#e0e7ff;display:flex;align-items:center;justify-content:center;font-size:14px;">👤</div>
            <div>
              <p style="margin:0;font-size:12px;font-weight:600;color:#374151;">${ctx.author_name ?? "Sarah Mitchell"}</p>
              <p style="margin:0;font-size:11px;color:#9ca3af;">Author</p>
            </div>
          </div>`;
      case "welcome":
        return `
          <p style="font-size:15px;color:#4b5563;margin:0 0 12px;line-height:1.7;">
            Hi <strong style="color:#111827;">${ctx.user_name ?? "Alex Johnson"}</strong>,<br>
            Welcome to <strong>${ctx.org_name ?? "Orbi Solutions"}</strong>! Your account is ready. Explore projects, collaborate with your team, and manage tasks — all in one place.
          </p>
          <div style="display:grid;gap:10px;margin-bottom:20px;">
            <div style="padding:12px 16px;background:#f5f3ff;border-radius:10px;border-left:3px solid #d82638;">
              <p style="margin:0;font-size:13px;font-weight:600;color:#b91c2c;">✓ Create your first project</p>
            </div>
            <div style="padding:12px 16px;background:#f0fdf4;border-radius:10px;border-left:3px solid #22c55e;">
              <p style="margin:0;font-size:13px;font-weight:600;color:#15803d;">✓ Invite team members</p>
            </div>
          </div>
          <div style="text-align:center;">
            <a href="#" style="display:inline-block;padding:13px 32px;background:#d82638;color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;">Get Started</a>
          </div>`;
      case "mention":
        return `
          <div style="padding:14px 16px;background:#f0f9ff;border-radius:10px;border-left:3px solid #0ea5e9;margin-bottom:20px;">
            <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#0369a1;">💬 ${ctx.channel_name ? `#${ctx.channel_name}` : "Project Discussion"}</p>
            <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">${ctx.body ?? "Hey, could you review the updated mockups and share your feedback?"}</p>
          </div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
            <div style="width:36px;height:36px;border-radius:50%;background:#e0e7ff;text-align:center;line-height:36px;font-size:16px;">👤</div>
            <div>
              <p style="margin:0;font-size:13px;font-weight:600;color:#111827;">${ctx.sender_name ?? "Alex Johnson"}</p>
              <p style="margin:0;font-size:11px;color:#9ca3af;">mentioned you</p>
            </div>
          </div>
          <div style="text-align:center;">
            <a href="#" style="display:inline-block;padding:13px 32px;background:#d82638;color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;">View Mention</a>
          </div>`;
      case "change_request_review":
        return `
          <div style="padding:14px 16px;background:#fffbeb;border-radius:10px;border:1px solid #fde68a;margin-bottom:16px;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:.8px;">Awaiting Your Review</p>
            <p style="margin:0;font-size:14px;font-weight:600;color:#374151;">${ctx.task_title ?? "Redesign landing page hero"}</p>
          </div>
          <p style="font-size:13px;color:#6b7280;margin:0 0 6px;">Requested by <strong style="color:#374151;">${ctx.requester_name ?? "Jamie Chen"}</strong></p>
          <p style="font-size:14px;color:#4b5563;margin:0 0 20px;line-height:1.6;font-style:italic;">"${ctx.reason ?? "The current design needs a refresh before the Q4 launch."}"</p>
          <div style="text-align:center;">
            <a href="#" style="display:inline-block;padding:13px 32px;background:#d82638;color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;">Review Change Request</a>
          </div>`;
      case "change_request_approved":
        return `
          <div style="padding:14px 16px;background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;margin-bottom:16px;display:flex;align-items:center;gap:12px;">
            <span style="font-size:24px;">✅</span>
            <div>
              <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#15803d;">Change Request Approved</p>
              <p style="margin:0;font-size:13px;color:#374151;">${ctx.task_title ?? "Redesign landing page hero"}</p>
            </div>
          </div>
          <p style="font-size:13px;color:#6b7280;margin:0 0 8px;">Approved by <strong style="color:#374151;">${ctx.reviewer_name ?? "Alice Manager"}</strong></p>
          <div style="padding:12px 16px;background:#f9fafb;border-radius:8px;border-left:3px solid #22c55e;margin-bottom:20px;">
            <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">${ctx.note ?? "Great work! Approved for implementation."}</p>
          </div>
          <div style="text-align:center;">
            <a href="#" style="display:inline-block;padding:13px 32px;background:#d82638;color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;">View Task</a>
          </div>`;
      case "change_request_rejected":
        return `
          <div style="padding:14px 16px;background:#fef2f2;border-radius:10px;border:1px solid #fecaca;margin-bottom:16px;display:flex;align-items:center;gap:12px;">
            <span style="font-size:24px;">❌</span>
            <div>
              <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#dc2626;">Change Request Rejected</p>
              <p style="margin:0;font-size:13px;color:#374151;">${ctx.task_title ?? "Redesign landing page hero"}</p>
            </div>
          </div>
          <p style="font-size:13px;color:#6b7280;margin:0 0 8px;">Reviewed by <strong style="color:#374151;">${ctx.reviewer_name ?? "Alice Manager"}</strong></p>
          <div style="padding:12px 16px;background:#f9fafb;border-radius:8px;border-left:3px solid #ef4444;margin-bottom:20px;">
            <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">${ctx.note ?? "The proposed changes conflict with brand guidelines. Please revise and resubmit."}</p>
          </div>
          <div style="text-align:center;">
            <a href="#" style="display:inline-block;padding:13px 32px;background:#d82638;color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;">View Task</a>
          </div>`;
      default: // notification
        return `
          <p style="font-size:15px;color:#4b5563;margin:0 0 20px;line-height:1.7;">${ctx.body ?? "You have been assigned a new task. Click below to view the details."}</p>
          <div style="text-align:center;">
            <a href="#" style="display:inline-block;padding:13px 32px;background:#d82638;color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;">${ctx.cta_text ?? "Open Simplify Projects"}</a>
          </div>`;
    }
  })();

  const header = (() => {
    const colorMap: Record<string, string> = {
      password_reset: "#f59e0b",
      otp: "#7c3aed",
      announcement:
        ctx.priority === "urgent"
          ? "#dc2626"
          : ctx.priority === "high"
            ? "#ea580c"
            : "#d82638",
      welcome: "#d82638",
      mention: "#0ea5e9",
      change_request_review: "#d82638",
      change_request_approved: "#16a34a",
      change_request_rejected: "#dc2626",
    };
    const titleMap: Record<string, string> = {
      password_reset: "Reset Your Password",
      otp: "Verification Code",
      announcement: ctx.title ?? "Team Announcement",
      welcome: `Welcome aboard, ${ctx.user_name ?? "there"}!`,
      mention: ctx.title ?? "You were mentioned",
      change_request_review: "Change Request Review",
      change_request_approved: "Change Request Approved",
      change_request_rejected: "Change Request Rejected",
    };
    const subtitleMap: Record<string, string> = {
      password_reset: "Choose a new secure password for your account",
      otp: `Enter this code in ${ctx.org_name ?? "Simplify Projects"} to verify your identity`,
      announcement: `From ${ctx.author_name ?? "your team"}`,
      welcome: `Your ${ctx.org_name ?? "Simplify Projects"} account is ready`,
      mention: `${ctx.sender_name ?? "Someone"} mentioned you`,
      change_request_review: `Requested by ${ctx.requester_name ?? "a team member"}`,
      change_request_approved: `Your request has been approved`,
      change_request_rejected: `Your request requires revision`,
    };
    const bg = colorMap[name] ?? "#d82638";
    const title = titleMap[name] ?? ctx.title ?? "Notification";
    const subtitle = subtitleMap[name] ?? "";
    return `<td style="background-color:${bg};padding:36px 40px 30px;text-align:center;">
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#fff;line-height:1.3;">${title}</h1>
      ${subtitle ? `<p style="margin:0;font-size:13px;color:rgba(255,255,255,.8);line-height:1.5;">${subtitle}</p>` : ""}
    </td>`;
  })();

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background-color:#f0eef9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f0eef9;">
  <tr>
    <td align="center" style="padding:40px 16px 48px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:580px;">
        <!-- Org branding -->
        <tr>
          <td style="padding-bottom:20px;text-align:center;">
            <span style="font-size:15px;font-weight:700;color:#4b5563;letter-spacing:-0.2px;">${ctx.org_name ?? "Simplify Projects"}</span>
          </td>
        </tr>
        <!-- Card -->
        <tr>
          <td style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
            <!-- Header -->
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>${header}</tr>
            </table>
            <!-- Body -->
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="padding:28px 36px 32px;">
                  ${cardContent}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding-top:24px;text-align:center;">
            <p style="margin:0 0 4px;font-size:12px;color:#6b7280;font-weight:600;">${ctx.org_name ?? "Simplify Projects"}</p>
            <p style="margin:0;font-size:11px;color:#9ca3af;">© ${new Date().getFullYear()} ${ctx.org_name ?? "Simplify Projects"} · <a href="#" style="color:#9ca3af;text-decoration:none;">Unsubscribe</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
