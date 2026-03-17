"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { api, ApiError } from "@/lib/api";
import { LoadingPage, Badge, ConfirmDialog } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useEmailEditor } from "@/components/email-editor-wrapper";
import {
  Mail,
  Pencil,
  Eye,
  KeyRound,
  ShieldCheck,
  Megaphone,
  PartyPopper,
  RotateCcw,
  Code2,
  LayoutTemplate,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const DEFAULT_TEMPLATES = [
  {
    name: "notification",
    label: "Notification",
    description: "General notification emails sent to project members",
    icon: Mail,
  },
  {
    name: "password_reset",
    label: "Password Reset",
    description: "Sent when a user requests a password reset link",
    icon: KeyRound,
  },
  {
    name: "otp",
    label: "OTP / Verification",
    description: "One-time passcode and account verification emails",
    icon: ShieldCheck,
  },
  {
    name: "announcement",
    label: "Announcement",
    description: "Emailed copies of organization announcements",
    icon: Megaphone,
  },
  {
    name: "welcome",
    label: "Welcome",
    description: "Sent to new users when they join the organization",
    icon: PartyPopper,
  },
];

const SAMPLE_CONTEXT: Record<string, Record<string, string>> = {
  notification: {
    title: "New task assigned",
    body: "You have been assigned to task: Design landing page",
  },
  password_reset: {
    reset_url: "https://app.orbispm.com/reset?token=abc123",
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
};

const GLOBAL_VARS = ["app_name", "frontend_url"];

type EditorMode = "visual" | "code";

export default function EmailTemplatesTab() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const qc = useQueryClient();

  // Edit state
  const [editTemplate, setEditTemplate] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>("visual");
  const [editHtml, setEditHtml] = useState("");
  const [initialDesign, setInitialDesign] = useState<Record<string, unknown> | null>(null);

  // Preview / delete
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Auth token for image uploads
  const authToken = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  const uploadUrl = currentOrg ? `${API_BASE}/api/v1/orgs/${currentOrg.id}/uploads` : undefined;

  // Unlayer editor hook
  const { EditorComponent, exportTemplate } = useEmailEditor({
    initialDesign,
    uploadUrl,
    authToken: authToken ?? undefined,
    minHeight: 560,
  });

  const { data: customTemplates, isLoading } = useQuery({
    queryKey: ["email-templates", currentOrg?.id],
    queryFn: () => api.emailTemplates.listCustom(currentOrg!.id),
    enabled: !!currentOrg,
  });

  const customList = customTemplates?.templates || [];

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrg || !editTemplate) throw new Error("Missing context");

      if (editorMode === "visual") {
        // Export from Unlayer
        const { html, design } = await exportTemplate();
        return api.emailTemplates.upsert(currentOrg.id, editTemplate, html, design);
      } else {
        // Save raw HTML (no design JSON)
        return api.emailTemplates.upsert(currentOrg.id, editTemplate, editHtml, null);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      closeEditor();
    },
    onError: (e: Error) =>
      setError(e instanceof ApiError ? e.message : "Failed to save template"),
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => api.emailTemplates.delete(currentOrg!.id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      setDeleteTarget(null);
    },
  });

  const closeEditor = useCallback(() => {
    setEditTemplate(null);
    setEditHtml("");
    setInitialDesign(null);
    setError("");
  }, []);

  const openEditor = async (name: string, mode: EditorMode) => {
    setEditorMode(mode);
    setError("");

    try {
      const data = await api.emailTemplates.get(currentOrg!.id, name);
      setEditHtml(data.html);
      setInitialDesign(data.design ?? null);
    } catch {
      setEditHtml(getStarterTemplate(name));
      setInitialDesign(null);
    }
    setEditTemplate(name);
  };

  const handlePreview = (name: string) => {
    const context = SAMPLE_CONTEXT[name] || { title: "Preview", body: "This is a preview." };
    let html = editHtml || getStarterTemplate(name);

    for (const [key, value] of Object.entries({ ...context, app_name: "OrbisPM", frontend_url: "#" })) {
      html = html.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"), value);
    }
    html = html.replace(new RegExp("\\{%[\\s\\S]*?%\\}", "g"), "");
    html = html.replace(/\{\{.*?\}\}/g, "");

    setPreviewHtml(html);
    setPreviewTemplate(name);
  };

  const handlePreviewFromVisual = async () => {
    if (!editTemplate) return;
    try {
      const { html } = await exportTemplate();
      const context = SAMPLE_CONTEXT[editTemplate] || { title: "Preview", body: "This is a preview." };
      let rendered = html;
      for (const [key, value] of Object.entries({ ...context, app_name: "OrbisPM", frontend_url: "#" })) {
        rendered = rendered.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"), value);
      }
      rendered = rendered.replace(new RegExp("\\{%[\\s\\S]*?%\\}", "g"), "");
      rendered = rendered.replace(/\{\{.*?\}\}/g, "");
      setPreviewHtml(rendered);
      setPreviewTemplate(editTemplate);
    } catch {
      setError("Failed to export preview");
    }
  };

  if (isLoading) return <LoadingPage />;

  const editingMeta = DEFAULT_TEMPLATES.find((t) => t.name === editTemplate);
  const previewMeta = DEFAULT_TEMPLATES.find((t) => t.name === previewTemplate);
  const templateVars = Object.keys(SAMPLE_CONTEXT[editTemplate || "notification"] || {});

  return (
    <div>
      {/* Section description */}
      <div className="mb-5">
        <p className="text-sm text-base-content/60">
          Customize email templates sent to your organization members. Use the{" "}
          <strong>Visual Editor</strong> for drag-and-drop design, or the{" "}
          <strong>Code Editor</strong> for direct HTML with{" "}
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

      {/* Template list */}
      <div className="grid gap-3">
        {DEFAULT_TEMPLATES.map((tmpl) => {
          const hasCustom = customList.includes(tmpl.name);
          const Icon = tmpl.icon;
          return (
            <div
              key={tmpl.name}
              className="card bg-base-100 border border-base-200 shadow-sm card-compact hover:shadow-md transition-shadow"
            >
              <div className="card-body">
                <div className="flex items-center justify-between gap-3">
                  {/* Left: icon + text */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{tmpl.label}</span>
                        {hasCustom ? (
                          <Badge variant="badge-success badge-sm">Customized</Badge>
                        ) : (
                          <Badge variant="badge-ghost badge-sm">Default</Badge>
                        )}
                      </div>
                      <p className="text-xs text-base-content/50 mt-0.5 truncate">{tmpl.description}</p>
                    </div>
                  </div>

                  {/* Right: action buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      className="btn btn-ghost btn-xs btn-square"
                      onClick={() => handlePreview(tmpl.name)}
                      title="Preview default"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      className="btn btn-ghost btn-xs gap-1"
                      onClick={() => openEditor(tmpl.name, "visual")}
                      title="Visual editor"
                    >
                      <LayoutTemplate className="w-3.5 h-3.5" />
                      <span className="text-xs hidden sm:inline">Design</span>
                    </button>
                    <button
                      className="btn btn-ghost btn-xs gap-1"
                      onClick={() => openEditor(tmpl.name, "code")}
                      title="Code editor"
                    >
                      <Code2 className="w-3.5 h-3.5" />
                      <span className="text-xs hidden sm:inline">Code</span>
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
            </div>
          );
        })}
      </div>

      {/* ── Visual Editor Modal (full-width) ── */}
      <Modal
        open={!!editTemplate && editorMode === "visual"}
        onClose={closeEditor}
        title={`Design: ${editingMeta?.label || editTemplate}`}
        className="max-w-6xl"
      >
        {error && (
          <div role="alert" className="alert alert-error mb-4">
            <span>{error}</span>
          </div>
        )}
        <div className="space-y-4">
          {/* Merge tags hint */}
          <div className="rounded-xl bg-base-200/70 border border-base-300 px-4 py-3">
            <p className="text-xs font-semibold text-base-content/60 mb-1.5 uppercase tracking-wide">
              Merge tags available in the editor
            </p>
            <p className="text-xs text-base-content/50">
              Use the <strong>Merge Tags</strong> dropdown in the editor toolbar to insert dynamic variables like{" "}
              <code className="badge badge-xs badge-outline font-mono">{"{{title}}"}</code>,{" "}
              <code className="badge badge-xs badge-outline font-mono">{"{{body}}"}</code>, etc.
            </p>
          </div>

          {/* Unlayer editor */}
          <div className="rounded-xl overflow-hidden">{EditorComponent}</div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <Button variant="ghost" size="sm" onClick={handlePreviewFromVisual}>
              <Eye className="w-4 h-4" /> Preview
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={closeEditor}>
                Cancel
              </Button>
              <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
                Save Template
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Code Editor Modal ── */}
      <Modal
        open={!!editTemplate && editorMode === "code"}
        onClose={closeEditor}
        title={`Code: ${editingMeta?.label || editTemplate}`}
        className="max-w-4xl"
      >
        {error && (
          <div role="alert" className="alert alert-error mb-4">
            <span>{error}</span>
          </div>
        )}
        <div className="space-y-4">
          {/* Available variables hint */}
          <div className="rounded-xl bg-base-200/70 border border-base-300 px-4 py-3">
            <p className="text-xs font-semibold text-base-content/60 mb-2 uppercase tracking-wide">
              Available variables
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[...templateVars, ...GLOBAL_VARS].map((v) => (
                <code
                  key={v}
                  className="badge badge-xs badge-outline font-mono text-[10px] px-1.5"
                >
                  {"{{ " + v + " }}"}
                </code>
              ))}
            </div>
          </div>

          {/* HTML editor */}
          <div className="form-control">
            <label className="label pb-1">
              <span className="label-text font-semibold text-sm">HTML Template</span>
              <span className="label-text-alt text-base-content/40 text-xs">Jinja2 syntax supported</span>
            </label>
            <textarea
              className="textarea textarea-bordered w-full font-mono text-xs leading-relaxed resize-y"
              rows={22}
              value={editHtml}
              onChange={(e) => setEditHtml(e.target.value)}
              placeholder="Enter your HTML email template..."
              spellCheck={false}
            />
          </div>

          {/* Action row */}
          <div className="flex items-center justify-between pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => editTemplate && handlePreview(editTemplate)}
            >
              <Eye className="w-4 h-4" /> Preview
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={closeEditor}>
                Cancel
              </Button>
              <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
                Save Template
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Preview Modal ── */}
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

      {/* ── Reset confirm ── */}
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
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f4f4f5; }
.wrap { max-width: 600px; margin: 0 auto; padding: 32px 16px; }
.card { background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
.logo { color: #6366f1; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 24px; }
h1 { font-size: 20px; color: #18181b; margin: 0 0 12px; font-weight: 600; }
p { font-size: 15px; color: #52525b; line-height: 1.7; margin: 0 0 16px; }
.btn { display: inline-block; padding: 12px 28px; background: #6366f1; color: #fff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 500; }
.footer { margin-top: 32px; text-align: center; font-size: 12px; color: #a1a1aa; }
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="logo">{{ app_name }}</div>
    <h1>{{ title }}</h1>
    <p>{{ body }}</p>
    <a href="{{ frontend_url }}" class="btn">Open {{ app_name }}</a>
  </div>
  <div class="footer">{{ app_name }}</div>
</div>
</body>
</html>`;
}
