import { create } from "zustand";
import type {
  Task,
  TaskTree,
  Checklist,
  Comment,
  TaskDependency,
  TaskWatcher,
  TaskChangeRequest,
  TaskUpdateResult,
} from "@/types/domain";

export type WsSendFn = (action: string, payload?: Record<string, any>) => Promise<any>;

interface ProjectTaskState {
  // Connection
  connected: boolean;
  roomSize: number;
  currentProjectId: string | null;
  _rawSend: WsSendFn | null;
  send: WsSendFn | null;

  // Task data (flat list – used by list-view and columns)
  tasks: Map<string, Task[]>; // key = query key (e.g. "root", parentId, filter hash)
  totals: Map<string, number>;

  // Task tree (tree view)
  taskTree: TaskTree[];

  // Loading flags
  loading: Set<string>; // active request IDs

  // Per-task sub-resources
  checklists: Map<string, Checklist[]>;
  comments: Map<string, Comment[]>;
  dependencies: Map<string, TaskDependency[]>;
  watchers: Map<string, TaskWatcher[]>;
  changeRequests: Map<string, TaskChangeRequest[]>;

  // ─── Actions ──────────────────────────────────

  setConnected: (v: boolean, roomSize?: number) => void;
  setSend: (fn: WsSendFn | null) => void;
  setRawSend: (fn: WsSendFn | null) => void;
  setCurrentProjectId: (id: string | null) => void;

  // Task list
  setTasks: (key: string, tasks: Task[], total: number) => void;
  setTaskTree: (tree: TaskTree[]) => void;

  // Real-time updates (from broadcasts)
  upsertTask: (task: Task) => void;
  removeTask: (taskId: string) => void;
  bulkUpsertTasks: (tasks: Task[]) => void;

  // Sub-resources
  setChecklists: (taskId: string, items: Checklist[]) => void;
  addChecklist: (taskId: string, item: Checklist) => void;
  updateChecklist: (taskId: string, id: string, changes: Partial<Checklist>) => void;
  removeChecklist: (taskId: string, id: string) => void;

  setComments: (taskId: string, items: Comment[]) => void;
  addComment: (taskId: string, item: Comment) => void;
  removeComment: (taskId: string, id: string) => void;

  setDependencies: (taskId: string, items: TaskDependency[]) => void;
  addDependency: (taskId: string, item: TaskDependency) => void;
  removeDependency: (taskId: string, depId: string) => void;

  setWatchers: (taskId: string, items: TaskWatcher[]) => void;

  setChangeRequests: (taskId: string, items: TaskChangeRequest[]) => void;

  // Loading
  setLoading: (id: string, v: boolean) => void;

  // Reset (on disconnect / leave project)
  reset: () => void;
}

const INITIAL: Pick<
  ProjectTaskState,
  | "connected"
  | "roomSize"
  | "currentProjectId"
  | "_rawSend"
  | "send"
  | "tasks"
  | "totals"
  | "taskTree"
  | "loading"
  | "checklists"
  | "comments"
  | "dependencies"
  | "watchers"
  | "changeRequests"
> = {
  connected: false,
  roomSize: 0,
  currentProjectId: null,
  _rawSend: null,
  send: null,
  tasks: new Map(),
  totals: new Map(),
  taskTree: [],
  loading: new Set(),
  checklists: new Map(),
  comments: new Map(),
  dependencies: new Map(),
  watchers: new Map(),
  changeRequests: new Map(),
};

export const useProjectTaskStore = create<ProjectTaskState>((set, get) => ({
  ...INITIAL,

  setConnected: (v, roomSize) =>
    set({ connected: v, roomSize: roomSize ?? get().roomSize }),

  setSend: (fn) => set({ send: fn }),

  setRawSend: (fn) => {
    if (!fn) {
      set({ _rawSend: null, send: null });
      return;
    }
    set({ _rawSend: fn });

    // If we're already in a project, re-join the room on reconnect
    const pid = get().currentProjectId;
    if (pid) {
      fn("project:join", { project_id: pid })
        .then((resp: any) => {
          const projectSend: WsSendFn = (action, payload) =>
            fn(action, { ...payload, project_id: pid });
          set({ send: projectSend, roomSize: resp?.room_size ?? 0 });
        })
        .catch(() => {
          set({ send: null });
        });
    }
  },

  setCurrentProjectId: (id) => {
    const prev = get().currentProjectId;
    const rawSend = get()._rawSend;

    // Leave previous project room
    if (prev && rawSend) {
      rawSend("project:leave", { project_id: prev }).catch(() => {});
    }

    // Clear project-specific data
    set({
      currentProjectId: id,
      send: null,
      tasks: new Map(),
      totals: new Map(),
      taskTree: [],
      checklists: new Map(),
      comments: new Map(),
      dependencies: new Map(),
      watchers: new Map(),
      changeRequests: new Map(),
      roomSize: 0,
    });

    // Join new project room
    if (id && rawSend) {
      rawSend("project:join", { project_id: id })
        .then((resp: any) => {
          const projectSend: WsSendFn = (action, payload) =>
            rawSend(action, { ...payload, project_id: id });
          set({ send: projectSend, roomSize: resp?.room_size ?? 0 });
        })
        .catch(() => {});
    }
  },

  // ─── Task data ────────────────────────────────

  setTasks: (key, tasks, total) =>
    set((s) => {
      const m = new Map(s.tasks);
      const t = new Map(s.totals);
      m.set(key, tasks);
      t.set(key, total);
      return { tasks: m, totals: t };
    }),

  setTaskTree: (tree) => set({ taskTree: tree }),

  upsertTask: (task) =>
    set((s) => {
      const m = new Map(s.tasks);
      for (const [key, list] of m) {
        const idx = list.findIndex((t) => t.id === task.id);
        if (idx >= 0) {
          const next = [...list];
          next[idx] = task;
          m.set(key, next);
        }
      }
      return { tasks: m };
    }),

  removeTask: (taskId) =>
    set((s) => {
      const m = new Map(s.tasks);
      for (const [key, list] of m) {
        const filtered = list.filter((t) => t.id !== taskId);
        if (filtered.length !== list.length) {
          m.set(key, filtered);
        }
      }
      return { tasks: m };
    }),

  bulkUpsertTasks: (tasks) => {
    for (const t of tasks) get().upsertTask(t);
  },

  // ─── Sub-resources ────────────────────────────

  setChecklists: (taskId, items) =>
    set((s) => {
      const m = new Map(s.checklists);
      m.set(taskId, items);
      return { checklists: m };
    }),

  addChecklist: (taskId, item) =>
    set((s) => {
      const m = new Map(s.checklists);
      m.set(taskId, [...(m.get(taskId) || []), item]);
      return { checklists: m };
    }),

  updateChecklist: (taskId, id, changes) =>
    set((s) => {
      const m = new Map(s.checklists);
      const list = m.get(taskId) || [];
      m.set(
        taskId,
        list.map((c) => (c.id === id ? { ...c, ...changes } : c)),
      );
      return { checklists: m };
    }),

  removeChecklist: (taskId, id) =>
    set((s) => {
      const m = new Map(s.checklists);
      m.set(
        taskId,
        (m.get(taskId) || []).filter((c) => c.id !== id),
      );
      return { checklists: m };
    }),

  setComments: (taskId, items) =>
    set((s) => {
      const m = new Map(s.comments);
      m.set(taskId, items);
      return { comments: m };
    }),

  addComment: (taskId, item) =>
    set((s) => {
      const m = new Map(s.comments);
      m.set(taskId, [...(m.get(taskId) || []), item]);
      return { comments: m };
    }),

  removeComment: (taskId, id) =>
    set((s) => {
      const m = new Map(s.comments);
      m.set(
        taskId,
        (m.get(taskId) || []).filter((c) => c.id !== id),
      );
      return { comments: m };
    }),

  setDependencies: (taskId, items) =>
    set((s) => {
      const m = new Map(s.dependencies);
      m.set(taskId, items);
      return { dependencies: m };
    }),

  addDependency: (taskId, item) =>
    set((s) => {
      const m = new Map(s.dependencies);
      m.set(taskId, [...(m.get(taskId) || []), item]);
      return { dependencies: m };
    }),

  removeDependency: (taskId, depId) =>
    set((s) => {
      const m = new Map(s.dependencies);
      m.set(
        taskId,
        (m.get(taskId) || []).filter((d) => d.depends_on_id !== depId),
      );
      return { dependencies: m };
    }),

  setWatchers: (taskId, items) =>
    set((s) => {
      const m = new Map(s.watchers);
      m.set(taskId, items);
      return { watchers: m };
    }),

  setChangeRequests: (taskId, items) =>
    set((s) => {
      const m = new Map(s.changeRequests);
      m.set(taskId, items);
      return { changeRequests: m };
    }),

  setLoading: (id, v) =>
    set((s) => {
      const l = new Set(s.loading);
      v ? l.add(id) : l.delete(id);
      return { loading: l };
    }),

  reset: () => set(INITIAL),
}));
