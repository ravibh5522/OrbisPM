import { api, ApiError } from "@/lib/api";
import type { DriveScope } from "@/types/domain";
import { toast } from "sonner";
import { create } from "zustand";

const MAX_CONCURRENT = 3;
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
const TOO_LARGE = "File too large (max 100 MB)";

export interface DriveUploadTarget {
  scope: DriveScope;
  scope_id: string;
  parent_id: string | null;
}

export type DriveUploadStatus =
  | "queued"
  | "uploading"
  | "done"
  | "error"
  | "cancelled";

export interface DriveUpload {
  id: string;
  orgId: string;
  file: File;
  target: DriveUploadTarget;
  status: DriveUploadStatus;
  progress: number;
  error?: string;
  /** Called after a successful upload (cache invalidation). */
  onUploaded: () => void;
}

interface DriveUploadState {
  uploads: DriveUpload[];
  collapsed: boolean;
  enqueue: (
    orgId: string,
    target: DriveUploadTarget,
    files: File[],
    onUploaded: () => void,
  ) => void;
  cancel: (id: string) => void;
  retry: (id: string) => void;
  clearFinished: () => void;
  setCollapsed: (v: boolean) => void;
}

// Abort controllers live outside the store: they are not render state.
const controllers = new Map<string, AbortController>();
let seq = 0;

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 402) return "Storage limit reached";
    if (err.status === 413) return TOO_LARGE;
    return err.message;
  }
  return "Upload failed";
}

export const useDriveUploadStore = create<DriveUploadState>((set, get) => {
  const patch = (id: string, p: Partial<DriveUpload>) =>
    set((s) => ({
      uploads: s.uploads.map((u) => (u.id === id ? { ...u, ...p } : u)),
    }));

  async function run(u: DriveUpload) {
    const ctrl = new AbortController();
    controllers.set(u.id, ctrl);
    patch(u.id, { status: "uploading", progress: 0, error: undefined });
    try {
      await api.drive.uploadFile(u.orgId, u.target, u.file, {
        onProgress: (progress) => patch(u.id, { progress }),
        signal: ctrl.signal,
      });
      patch(u.id, { status: "done", progress: 1 });
      u.onUploaded();
      // One shared toast id keeps a batch from stacking dozens of toasts.
      toast.success(`Uploaded "${u.file.name}"`, { id: "drive-upload" });
    } catch (err) {
      if (ctrl.signal.aborted) {
        patch(u.id, { status: "cancelled" });
      } else {
        const msg = errorMessage(err);
        patch(u.id, { status: "error", error: msg });
        toast.error(`${u.file.name}: ${msg}`);
      }
    } finally {
      controllers.delete(u.id);
      pump();
    }
  }

  function pump() {
    const { uploads } = get();
    let active = uploads.filter((u) => u.status === "uploading").length;
    for (const u of uploads) {
      if (active >= MAX_CONCURRENT) break;
      if (u.status !== "queued") continue;
      active++;
      void run(u);
    }
  }

  return {
    uploads: [],
    collapsed: false,

    enqueue: (orgId, target, files, onUploaded) => {
      const added: DriveUpload[] = files.map((file) => {
        const tooLarge = file.size > MAX_FILE_BYTES;
        return {
          id: String(++seq),
          orgId,
          file,
          target,
          status: tooLarge ? "error" : "queued",
          progress: 0,
          error: tooLarge ? TOO_LARGE : undefined,
          onUploaded,
        };
      });
      if (added.some((u) => u.status === "error")) toast.error(TOO_LARGE);
      set((s) => ({ uploads: [...s.uploads, ...added], collapsed: false }));
      pump();
    },

    cancel: (id) => {
      const ctrl = controllers.get(id);
      if (ctrl) ctrl.abort();
      else patch(id, { status: "cancelled" });
    },

    retry: (id) => {
      const u = get().uploads.find((x) => x.id === id);
      if (!u || u.file.size > MAX_FILE_BYTES) return;
      patch(id, { status: "queued", progress: 0, error: undefined });
      pump();
    },

    clearFinished: () =>
      set((s) => ({
        uploads: s.uploads.filter(
          (u) => u.status === "queued" || u.status === "uploading",
        ),
      })),

    setCollapsed: (v) => set({ collapsed: v }),
  };
});
