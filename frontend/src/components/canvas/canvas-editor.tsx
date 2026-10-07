"use client";

import { useProjectPermissions } from "@/hooks/use-project-permissions";
import { api, ApiError } from "@/lib/api";
import { STATUS_DOT, STATUS_HEX } from "@/lib/task-colors";
import { PresenceIndicator } from "@/components/ui/presence-indicator";
import { THEMES, useUIStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import type {
  CanvasEntityLink,
  CanvasEntityType,
  ProjectMember,
  Task,
  TaskStatus,
} from "@/types/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  ExcalidrawImperativeAPI,
  BinaryFiles,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { BUCKET_LABEL, BUCKET_STATUSES, CanvasLinkPanel } from "./canvas-link-panel";
import { MentionDropdown, type MentionRow } from "./mention-dropdown";
import {
  useCanvasMentions,
  type MentionSelection,
  type MentionTrigger,
} from "./use-canvas-mentions";

import "@excalidraw/excalidraw/index.css";

const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false },
);

interface CanvasEditorProps {
  orgId: string;
  projectId: string;
  canvasId: string;
  onBack: () => void;
}

const AUTOSAVE_DELAY_MS = 800;
const EMPTY_LINKS: CanvasEntityLink[] = [];
const MAX_CANVAS_BYTES = 8 * 1024 * 1024; // keep in sync with backend maxCanvasStateBytes
const DEAD_LINK_COLOR = "#9ca3af"; // neutral grey — entity was deleted/removed
const MEMBER_LINK_COLOR = "#6366f1"; // indigo — members have no inherent status color

const TRIGGER_TO_TYPE: Record<MentionTrigger, CanvasEntityType> = {
  "@": "task",
  "#": "bucket",
  $: "member",
};

type LinkedElementCustomData = {
  linkedEntities?: CanvasEntityLink[];
  baseText?: string;
  // The exact text we last wrote. If the element's current text no longer
  // matches this, the user edited it since — see userEditedSinceOurLastWrite.
  lastAppliedText?: string;
};

function getCustomData(el: ExcalidrawElement): LinkedElementCustomData {
  return (el.customData ?? {}) as LinkedElementCustomData;
}

export function CanvasEditor({
  orgId,
  projectId,
  canvasId,
  onBack,
}: CanvasEditorProps) {
  const { can: canProject } = useProjectPermissions(projectId);
  const canEdit = canProject("project", "update");
  const user = useAuthStore((s) => s.user);
  const theme = useUIStore((s) => s.theme);
  const colorScheme =
    THEMES.find((t) => t.value === theme)?.colorScheme ?? "light";

  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [links, setLinks] = useState<CanvasEntityLink[]>(EMPTY_LINKS);
  const [selectedLinks, setSelectedLinks] = useState<CanvasEntityLink[]>([]);
  const versionRef = useRef<number>(1);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dirtyRef = useRef(false);
  // Mirrors dirtyRef into render-visible state — the ref alone is enough for
  // synchronous checks inside effects/callbacks, but the UI (the "unsaved
  // changes" indicator and the manual Save button) needs an actual re-render
  // when it flips.
  const [isDirty, setIsDirty] = useState(false);
  const setDirty = useCallback((value: boolean) => {
    dirtyRef.current = value;
    setIsDirty(value);
  }, []);
  // Detects whether an onChange firing represents a genuine user edit or
  // just an echo of a scene update WE triggered ourselves (remote-version
  // sync, live-data suffix refresh) — by comparing content, not by guessing
  // *when* it's safe to stop suppressing. A time-based flag (set before our
  // own updateScene() call, cleared shortly after) was tried first and
  // wasn't reliable: it assumes onChange finishes firing before the flag
  // resets, but that ordering isn't actually guaranteed against React's own
  // scheduling, and a single updateScene() call can fire onChange more than
  // once. When the timing lost that race, the echo slipped through as a
  // real edit, got saved, updated the cache, and re-triggered the sync
  // effect — a canvas's version climbed into the tens of thousands from
  // exactly this. Excalidraw already bumps `version` on every element on any
  // real mutation, so comparing that per-element fingerprint against the
  // last state we know is already reflected (either just saved, or just
  // pushed in by us) tells genuine changes apart from echoes deterministically.
  const lastKnownFingerprintRef = useRef<string>("");
  const fingerprint = useCallback(
    (elements: readonly ExcalidrawElement[]) =>
      elements.map((el) => `${el.id}:${el.version}`).join(","),
    [],
  );
  const qc = useQueryClient();
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "conflict"
  >("idle");

  const { data: canvas, isLoading } = useQuery({
    queryKey: ["canvas", orgId, projectId, canvasId],
    queryFn: () => api.canvases.get(orgId, projectId, canvasId),
  });

  useEffect(() => {
    if (canvas) {
      versionRef.current = canvas.version;
      setLinks(canvas.state?.links ?? []);
      lastKnownFingerprintRef.current = fingerprint(
        (canvas.state?.scene?.elements as ExcalidrawElement[]) ?? [],
      );
    }
  }, [canvas?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // A collaborator's save elsewhere invalidates the query above and refetches
  // it, but Excalidraw's `initialData` only applies at mount — push newer
  // remote versions into the live instance. Skipped while the local editor
  // is mid-edit (dirtyRef) so we never stomp changes the user hasn't saved
  // yet; they'll pick up the remote version on their own next autosave cycle.
  useEffect(() => {
    if (!canvas || !excalidrawAPI) return;
    if (dirtyRef.current) return;
    if (canvas.version <= versionRef.current) return;
    versionRef.current = canvas.version;
    setLinks(canvas.state?.links ?? []);
    const elements = (canvas.state?.scene?.elements as ExcalidrawElement[]) ?? [];
    excalidrawAPI.updateScene({ elements });
    // Read back what Excalidraw actually ended up with (its own imperative
    // scene state, updated synchronously by the call above) rather than
    // fingerprinting what we passed in — avoids any assumption about
    // whether updateScene's internal reconciliation bumps element versions.
    lastKnownFingerprintRef.current = fingerprint(excalidrawAPI.getSceneElements());
  }, [canvas, excalidrawAPI, fingerprint]);

  // Corrects the initial fingerprint (set from raw stored data, before
  // Excalidraw exists, as a best-effort default) once Excalidraw actually
  // finishes mounting with initialData — same reasoning as the read-back in
  // the effect above: whatever normalization Excalidraw does to the
  // elements it's handed, this captures the true resulting state instead of
  // assuming the raw stored data matches it exactly.
  useEffect(() => {
    if (!excalidrawAPI) return;
    lastKnownFingerprintRef.current = fingerprint(excalidrawAPI.getSceneElements());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excalidrawAPI]);

  const persist = useCallback(
    async (elements: readonly ExcalidrawElement[], files: unknown) => {
      if (!canEdit) return;
      const nextLinks: CanvasEntityLink[] = [];
      for (const el of elements) {
        const linked = getCustomData(el).linkedEntities;
        if (linked) nextLinks.push(...linked);
      }
      setLinks(nextLinks);

      const payload = {
        version: 1,
        // appState is deliberately not persisted: it's transient UI state
        // (selection, editing, collaborators) and some of its fields are
        // real Map/Set instances that silently corrupt into plain objects
        // across a JSON round-trip — collaborators did exactly this and
        // crashed Excalidraw's internals on reload.
        scene: {
          elements,
          files: files as Record<string, unknown>,
        },
        links: nextLinks,
      };

      const byteSize = new Blob([JSON.stringify(payload)]).size;
      if (byteSize > MAX_CANVAS_BYTES) {
        toast.error(
          "This canvas is too large to save. Try removing large embedded images.",
        );
        return;
      }

      setSaveState("saving");
      try {
        const updated = await api.canvases.saveState(
          orgId,
          projectId,
          canvasId,
          payload,
          versionRef.current,
        );
        versionRef.current = updated.version;
        setDirty(false);
        setSaveState("saved");
        // Write the cache directly rather than waiting for the WS-triggered
        // invalidate/refetch — that broadcast is org-wide with no sender
        // exclusion, so our own save's echo can otherwise race this local
        // version bump and cause the "push remote version" effect to think
        // its own save is a newer remote edit, re-applying it and looping.
        qc.setQueryData(["canvas", orgId, projectId, canvasId], updated);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setSaveState("conflict");
          toast.error(
            "Someone else edited this canvas. Refresh to see their changes before continuing.",
          );
        } else if (err instanceof ApiError && err.status === 413) {
          setSaveState("idle");
          toast.error(
            "This canvas is too large to save. Try removing large embedded images.",
          );
        } else {
          setSaveState("idle");
          toast.error("Couldn't save canvas changes.");
        }
      }
    },
    [orgId, projectId, canvasId, canEdit, qc, setDirty],
  );

  const handleChange = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      appState: unknown,
      files: unknown,
    ) => {
      // An onChange firing that reflects content we already know about (an
      // echo of a scene update WE triggered — remote-version sync, live-data
      // suffix refresh — however many times it fires) rather than a genuine
      // edit. See lastKnownFingerprintRef's comment for why this is a
      // content comparison rather than a "was this us" flag.
      const fp = fingerprint(elements);
      if (fp === lastKnownFingerprintRef.current) return;
      lastKnownFingerprintRef.current = fp;
      if (!canEdit || saveState === "conflict") return;
      setDirty(true);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        if (dirtyRef.current) persist(elements, files);
      }, AUTOSAVE_DELAY_MS);

      // Track selection -> show live link panel for the selected element.
      const state = appState as { selectedElementIds?: Record<string, boolean> };
      const selectedIds = Object.keys(state.selectedElementIds ?? {});
      if (selectedIds.length === 1) {
        const el = elements.find((e) => e.id === selectedIds[0]);
        setSelectedLinks(el ? getCustomData(el).linkedEntities ?? [] : []);
      } else {
        setSelectedLinks([]);
      }
    },
    [canEdit, saveState, persist, setDirty, fingerprint],
  );

  const handleMentionSelect = useCallback(
    async (elementId: string, trigger: MentionTrigger, selection: MentionSelection) => {
      if (!excalidrawAPI) return;
      const { newElementWith } = await import("@excalidraw/excalidraw");
      const elements = excalidrawAPI.getSceneElements();
      const el = elements.find((e) => e.id === elementId);
      if (!el) return;
      const entityType = TRIGGER_TO_TYPE[trigger];
      const link: CanvasEntityLink = {
        element_id: elementId,
        trigger,
        entity_type: entityType,
        entity_id: selection.id,
      };
      // Re-linking replaces any existing link of the SAME type on this
      // element (you can't link two tasks to one note) but keeps links of
      // the other two types, so a note can carry a task + a bucket + a
      // member all at once.
      const existing = getCustomData(el).linkedEntities ?? [];
      const nextLinks = [...existing.filter((l) => l.entity_type !== entityType), link];
      // newElementWith (a new object, not an in-place mutation) rather than
      // mutateElement — mutateElement's own docs say it "does not trigger
      // re-render" on its own, and in practice the static canvas render
      // cache didn't reliably pick up an in-place-mutated element even after
      // updateScene(): the color/text change was only visible once you
      // entered edit mode on it, which forces a redraw through a different
      // path. A genuinely new object reference is unambiguous to any
      // reconciliation/cache layer, in-place mutation isn't.
      const updatedEl = newElementWith(el, {
        customData: { ...getCustomData(el), linkedEntities: nextLinks },
      });
      excalidrawAPI.updateScene({
        elements: elements.map((e) => (e.id === elementId ? updatedEl : e)),
      });
    },
    [excalidrawAPI],
  );

  const { mention, select } = useCanvasMentions(
    excalidrawAPI,
    handleMentionSelect,
  );

  // The canvas tab now stays mounted (hidden via CSS) instead of unmounting
  // when you switch to another project tab, so an in-progress autosave keeps
  // running normally instead of racing an unmount. But Excalidraw caches its
  // container's pixel size for coordinate math, and a `display:none`
  // container reports 0x0 — without telling it to recompute when the tab
  // becomes visible again, clicks/zoom can be off until a manual resize.
  useEffect(() => {
    if (!excalidrawAPI || !containerRef.current) return;
    const observer = new ResizeObserver(() => excalidrawAPI.refresh());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [excalidrawAPI]);

  // Explicit "Save now" for the header button — bypasses the autosave
  // debounce so a click gives an immediate, visible confirmation instead of
  // silently relying on the background timer.
  const handleManualSave = useCallback(() => {
    if (!excalidrawAPI || !isDirty) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    persist(excalidrawAPI.getSceneElements(), excalidrawAPI.getFiles());
  }, [excalidrawAPI, isDirty, persist]);

  // Flush any pending debounced save when leaving the editor so a quick
  // navigation right after the last edit doesn't silently drop it. Reads
  // through a ref since the unmount cleanup below only runs once and would
  // otherwise close over the excalidrawAPI/canEdit values from first render.
  const latestRef = useRef({ excalidrawAPI, canEdit, persist });
  latestRef.current = { excalidrawAPI, canEdit, persist };
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const { excalidrawAPI: api, canEdit: editable, persist: save } =
        latestRef.current;
      if (dirtyRef.current && api && editable) {
        save(api.getSceneElements(), api.getFiles());
      }
    };
  }, []);

  // The unmount flush above only covers in-app navigation (React actually
  // gets to run its cleanup). A hard refresh or closing the tab destroys the
  // page mid-flight instead — the pending 1.5s autosave timer never fires,
  // and the drawing is genuinely lost. visibilitychange fires reliably
  // before that happens (tab switch, minimize, and most navigations/closes),
  // so flush there immediately instead of waiting on the debounce; beforeunload
  // is the backstop that warns before an actual close/refresh if a save is
  // still in flight.
  useEffect(() => {
    const flushIfDirty = () => {
      const { excalidrawAPI: api, canEdit: editable, persist: save } =
        latestRef.current;
      if (dirtyRef.current && api && editable) {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        save(api.getSceneElements(), api.getFiles());
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) flushIfDirty();
    };
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        flushIfDirty();
        e.preventDefault();
        e.returnValue = "";
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  // ── Mention dropdown data sources, one per trigger ──────────────────────
  const taskMentionQuery = useQuery({
    queryKey: ["canvas-task-mention", orgId, projectId, mention?.query],
    queryFn: () =>
      api.tasks.list(
        orgId,
        projectId,
        `search=${encodeURIComponent(mention?.query ?? "")}&limit=8`,
      ),
    enabled: mention?.trigger === "@",
    staleTime: 10_000,
  });

  const memberMentionQuery = useQuery({
    queryKey: ["canvas-member-mention", orgId, projectId, mention?.query],
    queryFn: () =>
      api.projectMembers.list(orgId, projectId, {
        search: mention?.query || undefined,
        limit: 8,
      }),
    enabled: mention?.trigger === "$",
    staleTime: 10_000,
  });

  const bucketRows: MentionRow[] = useMemo(() => {
    if (mention?.trigger !== "#") return [];
    const q = mention.query.toLowerCase();
    return BUCKET_STATUSES.filter(
      (s) => !q || BUCKET_LABEL[s].toLowerCase().includes(q),
    ).map((s) => ({ id: s, label: BUCKET_LABEL[s], dotClassName: STATUS_DOT[s] }));
  }, [mention]);

  const dropdownResults: MentionRow[] = useMemo(() => {
    if (mention?.trigger === "@") {
      return (taskMentionQuery.data?.data ?? []).map((t) => ({
        id: t.id,
        label: t.title,
        dotClassName: STATUS_DOT[t.status],
      }));
    }
    if (mention?.trigger === "#") return bucketRows;
    if (mention?.trigger === "$") {
      return (memberMentionQuery.data?.data ?? []).map((m) => ({
        id: m.user_id,
        label: m.display_name || m.email,
        sublabel: m.email,
        avatarUrl: m.avatar_url || "",
      }));
    }
    return [];
  }, [mention, taskMentionQuery.data, memberMentionQuery.data, bucketRows]);

  const dropdownLoading =
    mention?.trigger === "@"
      ? taskMentionQuery.isFetching
      : mention?.trigger === "$"
        ? memberMentionQuery.isFetching
        : false;

  const [mentionIndex, setMentionIndex] = useState(0);
  useEffect(() => setMentionIndex(0), [mention?.query, mention?.trigger]);

  useEffect(() => {
    if (!mention) return;
    const handler = (e: KeyboardEvent) => {
      if (!dropdownResults.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % dropdownResults.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + dropdownResults.length) % dropdownResults.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const row = dropdownResults[mentionIndex];
        select({ id: row.id, label: row.label });
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [mention, dropdownResults, mentionIndex, select]);

  // ── Resolve live data for every link currently on the canvas ────────────
  const linkedTaskIds = useMemo(
    () =>
      Array.from(
        new Set(links.filter((l) => l.entity_type === "task").map((l) => l.entity_id)),
      ),
    [links],
  );
  const { data: linkedTasksRaw } = useQuery({
    queryKey: ["canvas-linked-tasks", orgId, projectId, linkedTaskIds],
    queryFn: () =>
      Promise.all(
        linkedTaskIds.map((id) =>
          api.tasks.get(orgId, projectId, id).catch(() => null),
        ),
      ),
    enabled: linkedTaskIds.length > 0,
    refetchInterval: 15_000,
  });
  // undefined = not yet resolved, null = confirmed deleted, Task = live.
  const linkedTasksById = useMemo(() => {
    const map = new Map<string, Task | null | undefined>();
    linkedTaskIds.forEach((id, i) => {
      if (linkedTasksRaw) map.set(id, linkedTasksRaw[i]);
    });
    return map;
  }, [linkedTasksRaw, linkedTaskIds]);

  const linkedBucketIds = useMemo(
    () =>
      Array.from(
        new Set(links.filter((l) => l.entity_type === "bucket").map((l) => l.entity_id)),
      ),
    [links],
  );
  const { data: bucketData } = useQuery({
    queryKey: ["canvas-bucket-counts", orgId, projectId, linkedBucketIds],
    queryFn: () =>
      Promise.all(
        linkedBucketIds.map((status) =>
          api.tasks
            .list(orgId, projectId, `status=${status}&limit=20`)
            .then((r) => ({ status, total: r.total, items: r.data })),
        ),
      ),
    enabled: linkedBucketIds.length > 0,
    refetchInterval: 15_000,
  });
  const bucketCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of bucketData ?? []) map.set(b.status, b.total);
    return map;
  }, [bucketData]);
  const bucketTasks = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const b of bucketData ?? []) map.set(b.status, b.items);
    return map;
  }, [bucketData]);

  const linkedMemberIds = useMemo(
    () =>
      Array.from(
        new Set(links.filter((l) => l.entity_type === "member").map((l) => l.entity_id)),
      ),
    [links],
  );
  const { data: allProjectMembers } = useQuery({
    queryKey: ["canvas-all-project-members", orgId, projectId],
    queryFn: () => api.projectMembers.list(orgId, projectId, { limit: 200 }),
    // Also needed for $member links AND to resolve a linked task's assignee
    // name/avatar (task status alone doesn't answer "who's on this").
    enabled: linkedMemberIds.length > 0 || linkedTaskIds.length > 0,
    staleTime: 30_000,
  });
  const memberById = useMemo(() => {
    const map = new Map<string, ProjectMember | null | undefined>();
    if (!allProjectMembers) return map;
    const found = new Map(allProjectMembers.data.map((m) => [m.user_id, m]));
    linkedMemberIds.forEach((id) => map.set(id, found.get(id) ?? null));
    return map;
  }, [allProjectMembers, linkedMemberIds]);
  const projectMemberByUserId = useMemo(() => {
    const map = new Map<string, ProjectMember>();
    for (const m of allProjectMembers?.data ?? []) map.set(m.user_id, m);
    return map;
  }, [allProjectMembers]);

  const { data: workloadData } = useQuery({
    queryKey: ["canvas-member-workload", orgId, projectId, linkedMemberIds],
    queryFn: () =>
      Promise.all(
        linkedMemberIds.map((uid) =>
          api.tasks
            .list(
              orgId,
              projectId,
              `assignee_id=${uid}&statuses=todo,in_progress,in_review&limit=1`,
            )
            .then((r) => ({ uid, total: r.total })),
        ),
      ),
    enabled: linkedMemberIds.length > 0,
    refetchInterval: 15_000,
  });
  const memberWorkload = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of workloadData ?? []) map.set(w.uid, w.total);
    return map;
  }, [workloadData]);

  // Refresh each linked element's text (live count/status/workload suffix,
  // appended to the text as originally typed) and stroke color whenever any
  // resolved link data changes. Runs after every relevant fetch/poll — cheap
  // no-op when nothing actually changed (compares before mutating/saving).
  useEffect(() => {
    if (!excalidrawAPI) return;
    if (
      linkedTasksById.size === 0 &&
      bucketCounts.size === 0 &&
      memberById.size === 0
    ) {
      return;
    }
    let changed = false;
    const elements = excalidrawAPI.getSceneElements();
    import("@excalidraw/excalidraw").then(({ newElementWith }) => {
      const nextElements = elements.map((el) => {
        if (el.type !== "text") return el;
        const cd = getCustomData(el);
        const entityLinks = cd.linkedEntities;
        if (!entityLinks || entityLinks.length === 0) return el;

        // If the text no longer matches what we last wrote, the user has
        // edited it since (added context, fixed a typo, ...) — their edit
        // wins. Stop touching the text on this element going forward so we
        // never silently clobber it; color-coding keeps updating either way
        // since that can't destroy anything the user typed.
        const userEditedSinceOurLastWrite =
          cd.lastAppliedText !== undefined && el.text !== cd.lastAppliedText;

        const baseText = cd.baseText ?? el.text;
        const parts: string[] = [];
        let strokeColor: string | undefined;

        for (const link of entityLinks) {
          if (link.entity_type === "task") {
            const task = linkedTasksById.get(link.entity_id);
            if (task === undefined) continue;
            if (task === null) {
              parts.push("(deleted)");
              strokeColor ??= DEAD_LINK_COLOR;
              continue;
            }
            const assigneeIds =
              task.assignee_ids && task.assignee_ids.length > 0
                ? task.assignee_ids
                : task.assignee_id
                  ? [task.assignee_id]
                  : [];
            const assigneeNames = assigneeIds
              .map((id) => projectMemberByUserId.get(id))
              .filter((m): m is ProjectMember => !!m)
              .map((m) => m.display_name || m.email);
            const assigneeSuffix =
              assigneeNames.length > 0 ? ` · ${assigneeNames.join(", ")}` : "";
            parts.push(`(${task.status.replace("_", " ")}${assigneeSuffix})`);
            strokeColor ??= STATUS_HEX[task.status];
          } else if (link.entity_type === "bucket") {
            const status = link.entity_id as TaskStatus;
            const count = bucketCounts.get(status);
            if (count === undefined) continue;
            parts.push(`(${count})`);
            strokeColor ??= STATUS_HEX[status] ?? MEMBER_LINK_COLOR;
          } else if (link.entity_type === "member") {
            const member = memberById.get(link.entity_id);
            if (member === undefined) continue;
            if (member === null) {
              parts.push("(removed)");
              strokeColor ??= DEAD_LINK_COLOR;
              continue;
            }
            const workload = memberWorkload.get(link.entity_id);
            parts.push(workload === undefined ? "" : `(${workload} active)`);
            strokeColor ??= MEMBER_LINK_COLOR;
          }
        }

        const suffix = parts.filter(Boolean).join(" ");
        const newText = suffix ? `${baseText} ${suffix}` : baseText;

        const textNeedsUpdate = !userEditedSinceOurLastWrite && el.text !== newText;
        // Capture baseText the first time we see this link, even if there's
        // no live data to append yet — otherwise a later run with the text
        // still unresolved would treat the (still bare) text as the base.
        const baseTextNeedsCapture = !userEditedSinceOurLastWrite && cd.baseText === undefined;

        const updates: { text?: string; strokeColor?: string; customData?: LinkedElementCustomData } = {};
        if (textNeedsUpdate) updates.text = newText;
        if (textNeedsUpdate || baseTextNeedsCapture) {
          updates.customData = { ...cd, baseText, lastAppliedText: newText };
        }
        if (strokeColor && el.strokeColor !== strokeColor) updates.strokeColor = strokeColor;
        if (Object.keys(updates).length === 0) return el;
        changed = true;
        return newElementWith(el, updates);
      });
      if (changed) {
        excalidrawAPI.updateScene({ elements: nextElements });
        // The live-data suffix/color is cosmetic and gets recomputed fresh
        // from live data on every load, so it deliberately isn't persisted
        // — mark the resulting fingerprint (read back, not predicted — see
        // the comment on the sibling remote-version-sync effect) as
        // already-known so the onChange echo doesn't trigger a save.
        lastKnownFingerprintRef.current = fingerprint(excalidrawAPI.getSceneElements());
      }
    });
  }, [
    excalidrawAPI,
    linkedTasksById,
    bucketCounts,
    memberById,
    memberWorkload,
    projectMemberByUserId,
    fingerprint,
  ]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-base-200 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={onBack}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="font-medium text-sm truncate">
            {canvas?.title}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <PresenceIndicator
            orgId={orgId}
            resourceType="canvas"
            resourceId={canvasId}
            currentUserId={user?.id || ""}
            currentUserName={user?.user_metadata?.name as string | undefined}
            currentUserAvatar={
              user?.user_metadata?.avatar_url as string | undefined
            }
          />
          <span className="text-xs text-base-content/40">
            {saveState === "saving" && "Saving…"}
            {saveState !== "saving" && saveState !== "conflict" && isDirty && (
              <span className="text-warning">Unsaved changes</span>
            )}
            {saveState !== "saving" && !isDirty && saveState === "saved" && "Saved"}
            {saveState === "conflict" && (
              <span className="text-error">
                Conflict — reload to continue editing
              </span>
            )}
          </span>
          {canEdit && (
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              disabled={!isDirty || saveState === "saving" || saveState === "conflict"}
              onClick={handleManualSave}
            >
              Save
            </button>
          )}
        </div>
      </div>

      <div ref={containerRef} className="relative flex-1 min-h-0">
        <div className="absolute inset-0">
          <Excalidraw
            excalidrawAPI={setExcalidrawAPI}
            theme={colorScheme}
            viewModeEnabled={!canEdit}
            // This canvas already autosaves to the project continuously —
            // Excalidraw's own local-file "Save to.../Open" menu items are
            // unrelated to that (they save/load a standalone .excalidraw
            // file) and only read as a second, conflicting save mechanism.
            // Image export stays since it's unambiguous and genuinely useful.
            UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false } }}
            initialData={{
              elements:
                (canvas?.state?.scene?.elements as ExcalidrawElement[]) ?? [],
              files: (canvas?.state?.scene?.files ?? {}) as BinaryFiles,
            }}
            onChange={handleChange}
          />
        </div>

        {mention && (
          <MentionDropdown
            top={mention.top}
            left={mention.left}
            trigger={mention.trigger}
            query={mention.query}
            results={dropdownResults}
            loading={dropdownLoading}
            activeIndex={mentionIndex}
            onSelect={(row) => select({ id: row.id, label: row.label })}
            onHover={setMentionIndex}
          />
        )}

        <CanvasLinkPanel
          links={selectedLinks}
          taskById={linkedTasksById}
          bucketCounts={bucketCounts}
          bucketTasks={bucketTasks}
          memberById={memberById}
          memberWorkload={memberWorkload}
          projectMemberByUserId={projectMemberByUserId}
        />
      </div>
    </div>
  );
}
