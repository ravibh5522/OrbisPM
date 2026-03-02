"use client";

import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-fields";
import {
  Plus,
  Trash2,
  GripVertical,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project, TaskStatusConfig } from "@/types/domain";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/* ═══════════════════════════════════════════════════════
   Project Settings — Custom Task Statuses
   ═══════════════════════════════════════════════════════ */

interface ProjectSettingsProps {
  orgId: string;
  project: Project;
}

const COLORS = [
  { id: "primary", label: "Primary", bg: "bg-primary" },
  { id: "secondary", label: "Secondary", bg: "bg-secondary" },
  { id: "accent", label: "Accent", bg: "bg-accent" },
  { id: "info", label: "Info", bg: "bg-info" },
  { id: "success", label: "Success", bg: "bg-success" },
  { id: "warning", label: "Warning", bg: "bg-warning" },
  { id: "error", label: "Error", bg: "bg-error" },
  { id: "neutral", label: "Neutral", bg: "bg-neutral" },
];

const DEFAULT_STATUSES: TaskStatusConfig[] = [
  { id: "todo", label: "To Do", color: "secondary" },
  { id: "in_progress", label: "In Progress", color: "info" },
  { id: "done", label: "Done", color: "success", done: true },
  { id: "blocked", label: "Blocked", color: "error" },
];

export function ProjectSettings({ orgId, project }: ProjectSettingsProps) {
  const qc = useQueryClient();

  // Get current statuses from project settings or use defaults
  const currentStatuses: TaskStatusConfig[] =
    (project.settings?.task_statuses as TaskStatusConfig[]) || DEFAULT_STATUSES;

  const [statuses, setStatuses] = useState<TaskStatusConfig[]>(currentStatuses);
  const [hasChanges, setHasChanges] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const saveMutation = useMutation({
    mutationFn: (newStatuses: TaskStatusConfig[]) =>
      api.projects.update(orgId, project.id, {
        settings: { task_statuses: newStatuses },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", orgId, project.id] });
      setHasChanges(false);
    },
  });

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setStatuses((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        setHasChanges(true);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }, []);

  const addStatus = useCallback(() => {
    const newId = `status_${Date.now()}`;
    setStatuses((prev) => [
      ...prev,
      { id: newId, label: "New Status", color: "neutral" },
    ]);
    setEditingId(newId);
    setHasChanges(true);
  }, []);

  const updateStatus = useCallback(
    (id: string, updates: Partial<TaskStatusConfig>) => {
      setStatuses((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
      );
      setHasChanges(true);
    },
    []
  );

  const removeStatus = useCallback((id: string) => {
    setStatuses((prev) => prev.filter((s) => s.id !== id));
    setHasChanges(true);
  }, []);

  const resetToDefaults = useCallback(() => {
    setStatuses(DEFAULT_STATUSES);
    setHasChanges(true);
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Task Workflow Statuses</h3>
            <p className="text-sm text-base-content/60">
              Configure the workflow statuses for tasks in this project.
              Drag to reorder. Mark one status as &quot;Done&quot; for progress tracking.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={resetToDefaults}>
              Reset to Defaults
            </Button>
            <Button variant="outline" size="sm" onClick={addStatus}>
              <Plus className="w-4 h-4 mr-1" /> Add Status
            </Button>
          </div>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={statuses.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {statuses.map((status) => (
                <SortableStatusRow
                  key={status.id}
                  status={status}
                  isEditing={editingId === status.id}
                  onEdit={() => setEditingId(status.id)}
                  onStopEdit={() => setEditingId(null)}
                  onUpdate={(updates) => updateStatus(status.id, updates)}
                  onRemove={() => removeStatus(status.id)}
                  canRemove={statuses.length > 1}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {hasChanges && (
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-base-200">
            <Button
              variant="ghost"
              onClick={() => {
                setStatuses(currentStatuses);
                setHasChanges(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate(statuses)}
              loading={saveMutation.isPending}
            >
              Save Changes
            </Button>
          </div>
        )}
      </Card>

      {/* Project Info (Name/Description) */}
      <ProjectInfoSettings orgId={orgId} project={project} />
    </div>
  );
}

/* ── Sortable Status Row ── */

interface SortableStatusRowProps {
  status: TaskStatusConfig;
  isEditing: boolean;
  onEdit: () => void;
  onStopEdit: () => void;
  onUpdate: (updates: Partial<TaskStatusConfig>) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function SortableStatusRow({
  status,
  isEditing,
  onEdit,
  onStopEdit,
  onUpdate,
  onRemove,
  canRemove,
}: SortableStatusRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: status.id });

  const [labelDraft, setLabelDraft] = useState(status.label);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const colorObj = COLORS.find((c) => c.id === status.color) || COLORS[0];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border border-base-300 bg-base-100",
        isDragging && "opacity-50"
      )}
    >
      {/* Drag handle */}
      <button
        className="btn btn-ghost btn-xs btn-square cursor-grab"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4 text-base-content/40" />
      </button>

      {/* Color indicator */}
      <div className="dropdown">
        <div
          tabIndex={0}
          role="button"
          className={cn("w-6 h-6 rounded-full cursor-pointer", colorObj.bg)}
          title="Change color"
        />
        <ul
          tabIndex={0}
          className="dropdown-content z-10 menu p-2 shadow bg-base-100 rounded-box w-36"
        >
          {COLORS.map((c) => (
            <li key={c.id}>
              <a
                onClick={() => onUpdate({ color: c.id })}
                className={cn(status.color === c.id && "font-bold")}
              >
                <span className={cn("w-4 h-4 rounded-full", c.bg)} />
                {c.label}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {/* Label */}
      {isEditing ? (
        <div className="flex-1 flex gap-2">
          <input
            type="text"
            className="input input-sm input-bordered flex-1"
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onUpdate({ label: labelDraft });
                onStopEdit();
              }
              if (e.key === "Escape") {
                setLabelDraft(status.label);
                onStopEdit();
              }
            }}
            autoFocus
          />
          <button
            className="btn btn-ghost btn-xs btn-square"
            onClick={() => {
              onUpdate({ label: labelDraft });
              onStopEdit();
            }}
          >
            <Check className="w-4 h-4 text-success" />
          </button>
          <button
            className="btn btn-ghost btn-xs btn-square"
            onClick={() => {
              setLabelDraft(status.label);
              onStopEdit();
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <span
          className="flex-1 font-medium cursor-pointer hover:text-primary"
          onClick={onEdit}
        >
          {status.label}
        </span>
      )}

      {/* ID badge */}
      <span className="badge badge-sm badge-ghost font-mono text-xs">
        {status.id}
      </span>

      {/* Done checkbox */}
      <label className="flex items-center gap-1 cursor-pointer">
        <input
          type="checkbox"
          className="checkbox checkbox-sm checkbox-success"
          checked={!!status.done}
          onChange={(e) => onUpdate({ done: e.target.checked || undefined })}
        />
        <span className="text-xs text-base-content/60">Done</span>
      </label>

      {/* Remove button */}
      <button
        className="btn btn-ghost btn-xs btn-square text-error"
        onClick={onRemove}
        disabled={!canRemove}
        title={canRemove ? "Remove status" : "Cannot remove the last status"}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

/* ── Project Info Settings ── */

function ProjectInfoSettings({ orgId, project }: ProjectSettingsProps) {
  const qc = useQueryClient();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || "");
  const [hasChanges, setHasChanges] = useState(false);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.projects.update(orgId, project.id, { name, description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", orgId, project.id] });
      setHasChanges(false);
    },
  });

  return (
    <Card>
      <h3 className="text-lg font-semibold mb-4">Project Information</h3>
      <div className="space-y-4">
        <div>
          <label className="label">
            <span className="label-text font-medium">Project Name</span>
          </label>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setHasChanges(true);
            }}
          />
        </div>
        <div>
          <label className="label">
            <span className="label-text font-medium">Description</span>
          </label>
          <textarea
            className="textarea textarea-bordered w-full"
            rows={3}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setHasChanges(true);
            }}
          />
        </div>
        {hasChanges && (
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setName(project.name);
                setDescription(project.description || "");
                setHasChanges(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              loading={saveMutation.isPending}
            >
              Save Changes
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
