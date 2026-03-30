"use client";

import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import type { StickyNote, StickyNoteCheckpoint } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Notebook,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

/* ─── limits ─── */
const MAX_TITLE = 50;
const MAX_DESCRIPTION = 200;
const MAX_CHECKPOINTS = 8;
const MAX_CHECKPOINT_TEXT = 60;
const MAX_DUE_MONTHS = 2;

function maxDueDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + MAX_DUE_MONTHS);
  return d.toISOString().slice(0, 10);
}

/* ─── theme-aware colour palette — higher opacity for readable contrast ─── */
const NOTE_COLORS: Record<string, { bg: string; border: string; dot: string }> =
  {
    yellow: {
      bg: "bg-warning/18",
      border: "border-warning/45",
      dot: "bg-warning",
    },
    pink: {
      bg: "bg-secondary/15",
      border: "border-secondary/45",
      dot: "bg-secondary",
    },
    blue: {
      bg: "bg-info/15",
      border: "border-info/45",
      dot: "bg-info",
    },
    green: {
      bg: "bg-success/15",
      border: "border-success/45",
      dot: "bg-success",
    },
    purple: {
      bg: "bg-primary/15",
      border: "border-primary/45",
      dot: "bg-primary",
    },
    orange: {
      bg: "bg-accent/15",
      border: "border-accent/45",
      dot: "bg-accent",
    },
  };

/* badge class for each priority — uses DaisyUI semantics for guaranteed contrast */
const PRIORITY_BADGE: Record<string, string> = {
  low: "badge-info",
  medium: "badge-warning",
  high: "badge-error",
  urgent: "badge-error",
};

const PRIORITY_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent!",
};

const COLOR_OPTIONS = Object.keys(NOTE_COLORS);

/* ─── helpers ─── */
function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isOverdue(note: StickyNote) {
  if (note.completed || !note.due_date) return false;
  return new Date(note.due_date) < new Date();
}

function isSameDay(a: Date, b: Date) {
  return dateKey(a) === dateKey(b);
}

/* ─── main component ─── */
export function StickyNotesPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedDate, setSelectedDate] = useState<string>(dateKey(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [editingNote, setEditingNote] = useState<StickyNote | null>(null);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setShowForm(false);
        setEditingNote(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // queries
  const { data: notesData } = useQuery({
    queryKey: ["sticky-notes"],
    queryFn: () => api.stickyNotes.list("limit=200"),
    enabled: open,
    refetchInterval: 60000,
  });

  const { data: stats } = useQuery({
    queryKey: ["sticky-notes-stats"],
    queryFn: () => api.stickyNotes.stats(),
    enabled: open,
    refetchInterval: 60000,
  });

  const notes = notesData?.data || [];

  // mutations
  const createMutation = useMutation({
    mutationFn: (data: Partial<StickyNote>) => api.stickyNotes.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sticky-notes"] });
      qc.invalidateQueries({ queryKey: ["sticky-notes-stats"] });
      setShowForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<StickyNote> }) =>
      api.stickyNotes.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sticky-notes"] });
      qc.invalidateQueries({ queryKey: ["sticky-notes-stats"] });
      setEditingNote(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.stickyNotes.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sticky-notes"] });
      qc.invalidateQueries({ queryKey: ["sticky-notes-stats"] });
    },
  });

  const toggleCompleteMutation = useMutation({
    mutationFn: (note: StickyNote) =>
      api.stickyNotes.update(note.id, { ...note, completed: !note.completed }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sticky-notes"] });
      qc.invalidateQueries({ queryKey: ["sticky-notes-stats"] });
    },
  });

  // date range
  const dateRange = useMemo(() => {
    const dates: Date[] = [];
    const today = new Date();
    for (let i = -7; i <= 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      dates.push(d);
    }
    return dates;
  }, []);

  // filter notes by selected date
  const filteredNotes = useMemo(() => {
    if (selectedDate === "all") return notes;
    return notes.filter((note) => {
      const due = note.due_date ? dateKey(new Date(note.due_date)) : null;
      const start = note.start_date ? dateKey(new Date(note.start_date)) : null;
      if (due === selectedDate || start === selectedDate) return true;
      // If note has a date range, include if selected date falls within
      if (note.start_date && note.due_date) {
        const s = new Date(note.start_date);
        const e = new Date(note.due_date);
        const sel = new Date(selectedDate);
        return sel >= s && sel <= e;
      }
      // Notes with no date: show on today
      if (!note.due_date && !note.start_date) {
        return selectedDate === dateKey(new Date());
      }
      return false;
    });
  }, [notes, selectedDate]);

  // count notes per date for dots
  const dateNoteCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const note of notes) {
      if (note.due_date) {
        const key = dateKey(new Date(note.due_date));
        counts[key] = (counts[key] || 0) + 1;
      }
    }
    return counts;
  }, [notes]);

  const overdue = stats?.overdue ?? 0;

  const scrollDates = (dir: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({
        left: dir === "left" ? -200 : 200,
        behavior: "smooth",
      });
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Toggle button */}
      <button
        className="btn btn-ghost btn-sm btn-square indicator"
        onClick={() => {
          setOpen((v) => !v);
          if (open) {
            setShowForm(false);
            setEditingNote(null);
          }
        }}
        aria-label="Sticky Notes"
        aria-expanded={open}
      >
        <Notebook className="w-5 h-5" />
        {overdue > 0 && (
          <span className="indicator-item badge badge-xs badge-error">
            {overdue}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          className={cn(
            "absolute right-0 top-full mt-2 z-50",
            "w-[720px] max-h-[85vh] rounded-box border border-base-200 bg-base-100/95 backdrop-blur-[20px] shadow-2xl",
            "flex flex-col",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-base-200 p-3">
            <div className="flex items-center gap-2">
              <Notebook className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold">My Notes</h3>
            </div>
            <button
              className="btn btn-ghost btn-xs btn-circle"
              onClick={() => {
                setShowForm(true);
                setEditingNote(null);
              }}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Stats bar */}
          {stats && (
            <div className="flex items-center gap-3 border-b border-base-200 px-3 py-2 text-xs">
              <span className="flex items-center gap-1 text-base-content/60">
                <Notebook className="w-3 h-3" /> {stats.total}
              </span>
              <span className="flex items-center gap-1 text-success">
                <CheckCircle2 className="w-3 h-3" /> {stats.completed}
              </span>
              <span className="flex items-center gap-1 text-error">
                <AlertTriangle className="w-3 h-3" /> {stats.overdue}
              </span>
              <span className="flex items-center gap-1 text-info">
                <Clock className="w-3 h-3" /> {stats.upcoming}
              </span>
            </div>
          )}

          {/* Date scroller */}
          <div className="flex items-center border-b border-base-200 px-1 py-1.5">
            <button
              className="btn btn-ghost btn-xs btn-circle flex-shrink-0"
              onClick={() => scrollDates("left")}
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <div
              ref={scrollRef}
              className="flex gap-1 overflow-x-auto scrollbar-none flex-1 px-1"
            >
              {dateRange.map((d) => {
                const key = dateKey(d);
                const isToday = isSameDay(d, new Date());
                const isSelected = selectedDate === key;
                const hasNotes = (dateNoteCounts[key] || 0) > 0;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDate(key)}
                    className={cn(
                      "flex flex-col items-center min-w-[40px] px-1.5 py-1 rounded-lg text-xs transition-all cursor-pointer",
                      isSelected
                        ? "bg-primary text-primary-content"
                        : isToday
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-base-200 text-base-content/60",
                    )}
                  >
                    <span className="text-[10px] font-medium uppercase">
                      {d
                        .toLocaleDateString("en", { weekday: "short" })
                        .slice(0, 3)}
                    </span>
                    <span className="font-bold">{d.getDate()}</span>
                    {hasNotes && (
                      <div
                        className={cn(
                          "w-1 h-1 rounded-full mt-0.5",
                          isSelected ? "bg-primary-content" : "bg-primary",
                        )}
                      />
                    )}
                  </button>
                );
              })}
            </div>
            <button
              className="btn btn-ghost btn-xs btn-circle flex-shrink-0"
              onClick={() => scrollDates("right")}
            >
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {/* Form + Card Grid — unified 3-col layout */}
          <div className="flex-1 overflow-y-auto p-3">
            {filteredNotes.length === 0 && !showForm && !editingNote && (
              <div className="flex flex-col items-center justify-center py-8 text-base-content/50">
                <Notebook className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">No notes for this date</p>
                <button
                  className="btn btn-ghost btn-xs mt-2"
                  onClick={() => setShowForm(true)}
                >
                  <Plus className="w-3 h-3" /> Add one
                </button>
              </div>
            )}

            {(filteredNotes.length > 0 || showForm || editingNote) && (
              <div className="grid grid-cols-3 gap-2">
                {/* Create / edit form spans 2 columns */}
                {(showForm || editingNote) && (
                  <div className="col-span-2">
                    <NoteForm
                      initial={editingNote}
                      isPending={
                        createMutation.isPending || updateMutation.isPending
                      }
                      onSubmit={(data) => {
                        if (editingNote) {
                          updateMutation.mutate({
                            id: editingNote.id,
                            data: { ...editingNote, ...data },
                          });
                        } else {
                          createMutation.mutate(data);
                        }
                      }}
                      onCancel={() => {
                        setShowForm(false);
                        setEditingNote(null);
                      }}
                    />
                  </div>
                )}

                {filteredNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onToggle={() => toggleCompleteMutation.mutate(note)}
                    onEdit={() => {
                      setEditingNote(note);
                      setShowForm(false);
                    }}
                    onDelete={() => deleteMutation.mutate(note.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Note Card ─── */
function NoteCard({
  note,
  onToggle,
  onEdit,
  onDelete,
}: {
  note: StickyNote;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const colors = NOTE_COLORS[note.color] || NOTE_COLORS.yellow;
  const priorityBadge = PRIORITY_BADGE[note.priority] || PRIORITY_BADGE.medium;
  const priorityLabel = PRIORITY_LABEL[note.priority] || PRIORITY_LABEL.medium;
  const overdue = isOverdue(note);
  const checkedCount = note.checkpoints.filter((c) => c.checked).length;
  const totalCheckpoints = note.checkpoints.length;

  return (
    <div
      className={cn(
        "relative rounded-xl border p-2.5 cursor-pointer transition-all hover:shadow-md group",
        "h-[148px] flex flex-col overflow-hidden",
        colors.bg,
        colors.border,
        note.completed && "opacity-55",
        overdue && "ring-1 ring-error/40",
      )}
      onClick={onEdit}
    >
      {/* Top row: priority badge + actions */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1">
          <div
            className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", colors.dot)}
          />
          <span
            className={cn(
              "badge badge-xs font-medium",
              priorityBadge,
              note.priority === "urgent" && "animate-pulse",
            )}
          >
            {priorityLabel}
          </span>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="btn btn-ghost btn-xs btn-circle"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            title={note.completed ? "Mark incomplete" : "Mark complete"}
          >
            <CheckCircle2
              className={cn(
                "w-3 h-3",
                note.completed ? "text-success" : "text-base-content/50",
              )}
            />
          </button>
          <button
            className="btn btn-ghost btn-xs btn-circle hover:text-error"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Title */}
      <h4
        className={cn(
          "font-semibold text-xs leading-snug mb-0.5 truncate text-base-content",
          note.completed && "line-through opacity-60",
        )}
      >
        {note.title}
      </h4>

      {/* Description */}
      {note.description && (
        <p className="text-xs text-base-content/70 line-clamp-2 mb-1">
          {note.description}
        </p>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Checkpoints progress */}
      {totalCheckpoints > 0 && (
        <div className="flex items-center gap-1.5 mb-1">
          <div className="flex-1 h-1 rounded-full bg-base-content/15 overflow-hidden">
            <div
              className="h-full rounded-full bg-success transition-all"
              style={{
                width: `${(checkedCount / totalCheckpoints) * 100}%`,
              }}
            />
          </div>
          <span className="text-xs text-base-content/60">
            {checkedCount}/{totalCheckpoints}
          </span>
        </div>
      )}

      {/* Timeline */}
      {note.due_date && (
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "flex items-center gap-0.5 text-xs",
              overdue ? "text-error font-semibold" : "text-base-content/60",
            )}
          >
            <Calendar className="w-3 h-3" />
            {formatDate(note.due_date)}
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── Note Form ─── */
function NoteForm({
  initial,
  isPending,
  onSubmit,
  onCancel,
}: {
  initial: StickyNote | null;
  isPending: boolean;
  onSubmit: (data: Partial<StickyNote>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [color, setColor] = useState(initial?.color || "yellow");
  const [priority, setPriority] = useState(initial?.priority || "medium");
  const [dueDate, setDueDate] = useState(
    initial?.due_date ? initial.due_date.slice(0, 10) : "",
  );
  const [startDate, setStartDate] = useState(
    initial?.start_date ? initial.start_date.slice(0, 10) : "",
  );
  const [checkpoints, setCheckpoints] = useState<StickyNoteCheckpoint[]>(
    initial?.checkpoints || [],
  );
  const [newCheckpoint, setNewCheckpoint] = useState("");

  const todayStr = new Date().toISOString().slice(0, 10);
  const maxDue = maxDueDate();

  const handleSubmit = () => {
    if (!title.trim()) return;
    onSubmit({
      title: title.trim().slice(0, MAX_TITLE),
      description: description.trim().slice(0, MAX_DESCRIPTION),
      color,
      priority,
      start_date: startDate ? new Date(startDate).toISOString() : undefined,
      due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
      checkpoints,
      completed: initial?.completed ?? false,
    });
  };

  const addCheckpoint = () => {
    if (!newCheckpoint.trim() || checkpoints.length >= MAX_CHECKPOINTS) return;
    setCheckpoints([
      ...checkpoints,
      {
        id: crypto.randomUUID(),
        text: newCheckpoint.trim().slice(0, MAX_CHECKPOINT_TEXT),
        checked: false,
      },
    ]);
    setNewCheckpoint("");
  };

  const toggleCheckpoint = (id: string) => {
    setCheckpoints(
      checkpoints.map((cp) =>
        cp.id === id ? { ...cp, checked: !cp.checked } : cp,
      ),
    );
  };

  const removeCheckpoint = (id: string) => {
    setCheckpoints(checkpoints.filter((cp) => cp.id !== id));
  };

  const colors = NOTE_COLORS[color] || NOTE_COLORS.yellow;

  return (
    <div
      className={cn(
        "rounded-xl border p-3 space-y-2",
        colors.bg,
        colors.border,
        "relative",
      )}
    >
      {/* Color picker */}
      <div className="flex items-center gap-1.5">
        {COLOR_OPTIONS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={cn(
              "w-5 h-5 rounded-full border-2 transition-transform",
              NOTE_COLORS[c].dot,
              color === c
                ? "scale-125 border-base-content"
                : "border-transparent hover:scale-110",
            )}
          />
        ))}
      </div>

      {/* Title */}
      <div>
        <input
          type="text"
          placeholder="Note title..."
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
          maxLength={MAX_TITLE}
          className="input input-sm input-bordered w-full bg-transparent font-semibold"
          autoFocus
        />
        <span className="text-[9px] text-base-content/30 float-right mt-0.5">
          {title.length}/{MAX_TITLE}
        </span>
      </div>

      {/* Description */}
      <div>
        <textarea
          placeholder="Description..."
          value={description}
          onChange={(e) =>
            setDescription(e.target.value.slice(0, MAX_DESCRIPTION))
          }
          maxLength={MAX_DESCRIPTION}
          rows={2}
          className="textarea textarea-bordered textarea-sm w-full bg-transparent text-xs resize-none"
        />
        <span className="text-[9px] text-base-content/30 float-right mt-0.5">
          {description.length}/{MAX_DESCRIPTION}
        </span>
      </div>

      {/* Priority */}
      <div className="flex items-center gap-2">
        <Flag className="w-3 h-3 text-base-content/40" />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="select select-bordered select-xs bg-transparent flex-1"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>

      {/* Dates */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[10px] text-base-content/40 mb-0.5 block">
            Start
          </label>
          <input
            type="date"
            value={startDate}
            max={maxDue}
            onChange={(e) => setStartDate(e.target.value)}
            className="input input-bordered input-xs w-full bg-transparent"
          />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-base-content/40 mb-0.5 block">
            Due
          </label>
          <input
            type="date"
            value={dueDate}
            min={startDate || todayStr}
            max={maxDue}
            onChange={(e) => setDueDate(e.target.value)}
            className="input input-bordered input-xs w-full bg-transparent"
          />
        </div>
      </div>

      {/* Checkpoints */}
      <div className="space-y-1">
        <span className="text-[10px] text-base-content/40">
          Checkpoints ({checkpoints.length}/{MAX_CHECKPOINTS})
        </span>
        {checkpoints.map((cp) => (
          <div key={cp.id} className="flex items-center gap-1.5 group/cp">
            <input
              type="checkbox"
              checked={cp.checked}
              onChange={() => toggleCheckpoint(cp.id)}
              className="checkbox checkbox-xs checkbox-primary"
            />
            <span
              className={cn(
                "text-xs flex-1",
                cp.checked && "line-through text-base-content/40",
              )}
            >
              {cp.text}
            </span>
            <button
              className="btn btn-ghost btn-xs btn-circle opacity-0 group-hover/cp:opacity-100"
              onClick={() => removeCheckpoint(cp.id)}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <div className="flex gap-1">
          <input
            type="text"
            placeholder={
              checkpoints.length >= MAX_CHECKPOINTS
                ? `Max ${MAX_CHECKPOINTS} checkpoints`
                : "Add checkpoint..."
            }
            value={newCheckpoint}
            onChange={(e) =>
              setNewCheckpoint(e.target.value.slice(0, MAX_CHECKPOINT_TEXT))
            }
            maxLength={MAX_CHECKPOINT_TEXT}
            disabled={checkpoints.length >= MAX_CHECKPOINTS}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCheckpoint();
              }
            }}
            className="input input-bordered input-xs bg-transparent flex-1"
          />
          <button
            className="btn btn-ghost btn-xs btn-circle"
            onClick={addCheckpoint}
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-1.5 pt-1">
        <button className="btn btn-ghost btn-xs" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn btn-primary btn-xs"
          onClick={handleSubmit}
          disabled={!title.trim() || isPending}
        >
          {isPending ? (
            <span className="loading loading-spinner loading-xs" />
          ) : initial ? (
            "Update"
          ) : (
            "Create"
          )}
        </button>
      </div>
    </div>
  );
}
