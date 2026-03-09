"use client";

import { cn } from "@/lib/utils";
import type { ProjectMember, Task, TaskPriority, TaskStatus } from "@/types/domain";
import {
    Check,
    ChevronRight,
    Copy,
    Link,
    Pencil,
    Plus,
    Trash2,
    UserPlus,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

const MAX_DEPTH = 3;

interface ContextMenuProps {
  x: number;
  y: number;
  task: Task;
  depth: number;
  members: ProjectMember[];
  onClose: () => void;
  onSelect: () => void;
  onUpdate: (data: Partial<Task>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAddSubtask: () => void;
  onCopyLink: () => void;
}

export function TaskContextMenu({
  x,
  y,
  task,
  depth: _depth,
  members,
  onClose,
  onSelect,
  onUpdate,
  onDelete,
  onDuplicate,
  onAddSubtask,
  onCopyLink,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [subMenu, setSubMenu] = useState<string | null>(null);

  // Close on click outside / escape / scroll
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleScroll = () => onClose();
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose]);

  // Adjust position to stay on screen
  const [pos, setPos] = useState({ x, y });
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    let nx = x, ny = y;
    if (x + rect.width > window.innerWidth) nx = x - rect.width;
    if (y + rect.height > window.innerHeight) ny = y - rect.height;
    if (nx < 0) nx = 4;
    if (ny < 0) ny = 4;
    setPos({ x: nx, y: ny });
  }, [x, y]);

  const menuItem = (
    label: string,
    icon: React.ReactNode,
    action: () => void,
    extra?: { danger?: boolean; submenuKey?: string; disabled?: boolean }
  ) => (
    <button
      key={label}
      className={cn(
        "flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm hover:bg-base-200 rounded transition-colors",
        extra?.danger && "text-error hover:bg-error/10",
        extra?.disabled && "opacity-40 pointer-events-none"
      )}
      onClick={(e) => {
        e.stopPropagation();
        if (extra?.submenuKey) {
          setSubMenu(subMenu === extra.submenuKey ? null : extra.submenuKey);
        } else {
          action();
          onClose();
        }
      }}
      onMouseEnter={() => {
        if (extra?.submenuKey) setSubMenu(extra.submenuKey);
        else setSubMenu(null);
      }}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {extra?.submenuKey && <ChevronRight className="w-3 h-3 text-base-content/40" />}
    </button>
  );

  const statusOptions: { value: TaskStatus; label: string; color: string }[] = [
    { value: "todo", label: "Todo", color: "bg-base-content/20" },
    { value: "in_progress", label: "In Progress", color: "bg-info" },
    { value: "done", label: "Done", color: "bg-success" },
    { value: "blocked", label: "Blocked", color: "bg-error" },
  ];

  const priorityOptions: { value: TaskPriority; label: string; color: string }[] = [
    { value: "critical", label: "Critical", color: "text-error" },
    { value: "high", label: "High", color: "text-warning" },
    { value: "medium", label: "Medium", color: "text-info" },
    { value: "low", label: "Low", color: "text-base-content/50" },
  ];

  return (
    <div
      ref={ref}
      className="fixed z-[100] bg-base-100 border border-base-200 rounded-lg shadow-xl py-1 min-w-[180px]"
      style={{ left: pos.x, top: pos.y }}
    >
      {menuItem("View / Edit", <Pencil className="w-3.5 h-3.5" />, onSelect)}

      <div className="border-t border-base-200 my-1" />

      {/* Status submenu */}
      <div className="relative">
        {menuItem(
          "Status",
          <span className={cn("w-2.5 h-2.5 rounded-full", statusOptions.find((s) => s.value === task.status)?.color)} />,
          () => {},
          { submenuKey: "status" }
        )}
        {subMenu === "status" && (
          <div className="absolute left-full top-0 ml-0.5 bg-base-100 border border-base-200 rounded-lg shadow-xl py-1 min-w-[140px] z-10">
            {statusOptions.map((s) => (
              <button
                key={s.value}
                className={cn(
                  "flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm hover:bg-base-200 rounded",
                  task.status === s.value && "font-medium"
                )}
                onClick={() => { onUpdate({ status: s.value }); onClose(); }}
              >
                <span className={cn("w-2 h-2 rounded-full", s.color)} />
                {s.label}
                {task.status === s.value && <Check className="w-3 h-3 ml-auto text-primary" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Priority submenu */}
      <div className="relative">
        {menuItem(
          "Priority",
          <span className={cn("text-xs font-bold", priorityOptions.find((p) => p.value === task.priority)?.color)}>!</span>,
          () => {},
          { submenuKey: "priority" }
        )}
        {subMenu === "priority" && (
          <div className="absolute left-full top-0 ml-0.5 bg-base-100 border border-base-200 rounded-lg shadow-xl py-1 min-w-[130px] z-10">
            {priorityOptions.map((p) => (
              <button
                key={p.value}
                className={cn(
                  "flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm hover:bg-base-200 rounded",
                  task.priority === p.value && "font-medium"
                )}
                onClick={() => { onUpdate({ priority: p.value }); onClose(); }}
              >
                <span className={cn("text-xs font-bold", p.color)}>!</span>
                {p.label}
                {task.priority === p.value && <Check className="w-3 h-3 ml-auto text-primary" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Assign To submenu */}
      <div className="relative">
        {menuItem(
          "Assign To",
          <UserPlus className="w-3.5 h-3.5" />,
          () => {},
          { submenuKey: "assign" }
        )}
        {subMenu === "assign" && (
          <div className="absolute left-full top-0 ml-0.5 bg-base-100 border border-base-200 rounded-lg shadow-xl py-1 min-w-[170px] max-h-48 overflow-y-auto z-10">
            <button
              className={cn(
                "flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm hover:bg-base-200 rounded",
                !task.assignee_id && "font-medium"
              )}
              onClick={() => { onUpdate({ assignee_id: "" } as Partial<Task>); onClose(); }}
            >
              Unassigned
              {!task.assignee_id && <Check className="w-3 h-3 ml-auto text-primary" />}
            </button>
            {members.map((m) => (
              <button
                key={m.user_id}
                className={cn(
                  "flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm hover:bg-base-200 rounded",
                  task.assignee_id === m.user_id && "font-medium"
                )}
                onClick={() => { onUpdate({ assignee_id: m.user_id } as Partial<Task>); onClose(); }}
              >
                <span className="truncate">{m.display_name || m.email || m.user_id.slice(0, 8)}</span>
                {task.assignee_id === m.user_id && <Check className="w-3 h-3 ml-auto text-primary" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-base-200 my-1" />

      {menuItem("Add Subtask", <Plus className="w-3.5 h-3.5" />, onAddSubtask, { disabled: task.depth >= MAX_DEPTH })}
      {menuItem("Duplicate", <Copy className="w-3.5 h-3.5" />, onDuplicate)}
      {menuItem("Copy Link", <Link className="w-3.5 h-3.5" />, onCopyLink)}

      <div className="border-t border-base-200 my-1" />

      {menuItem("Delete", <Trash2 className="w-3.5 h-3.5" />, onDelete, { danger: true })}
    </div>
  );
}
