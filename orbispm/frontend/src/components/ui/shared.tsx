"use client";

import { cn } from "@/lib/utils";

interface BadgeProps {
  variant?: string;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = "badge-ghost", children, className }: BadgeProps) {
  return <span className={cn("badge", variant, className)}>{children}</span>;
}

interface CardProps {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function Card({ title, description, actions, children, className, compact }: CardProps) {
  return (
    <div className={cn("card bg-base-100 shadow-sm border border-base-200", compact && "card-compact", className)}>
      <div className="card-body">
        {(title || actions) && (
          <div className="flex items-center justify-between">
            <div>
              {title && <h2 className="card-title">{title}</h2>}
              {description && <p className="text-sm text-base-content/60">{description}</p>}
            </div>
            {actions}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && <div className="text-base-content/30 mb-4">{icon}</div>}
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      {description && <p className="text-sm text-base-content/60 mb-4 max-w-md">{description}</p>}
      {action}
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="text-sm text-base-content/60 mt-1">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function LoadingPage() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <span className="loading loading-spinner loading-lg text-primary" />
    </div>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = "Delete", loading }: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <dialog className="modal modal-open">
      <div className="modal-box">
        <h3 className="font-bold text-lg">{title}</h3>
        <p className="py-4">{message}</p>
        <div className="modal-action">
          <button className="btn" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn btn-error" onClick={onConfirm} disabled={loading}>
            {loading && <span className="loading loading-spinner loading-sm" />}
            {confirmLabel}
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={onClose}>close</button>
      </form>
    </dialog>
  );
}

interface AvatarProps {
  name: string;
  src?: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  const sizeMap = { xs: "w-6 h-6 text-xs", sm: "w-8 h-8 text-sm", md: "w-10 h-10", lg: "w-16 h-16 text-lg" };
  const initials = (name || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  if (src) {
    return (
      <div className={cn("avatar", className)}>
        <div className={cn("rounded-full overflow-hidden", sizeMap[size])}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={name} className="object-cover w-full h-full" />
        </div>
      </div>
    );
  }
  return (
    <div className={cn("avatar placeholder", className)}>
      <div className={cn("bg-primary text-primary-content rounded-full", sizeMap[size])}>
        <span>{initials}</span>
      </div>
    </div>
  );
}

interface DataTableProps<T> {
  columns: { key: string; label: string; render?: (item: T) => React.ReactNode }[];
  data: T[];
  keyField: string;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  keyField,
  onRowClick,
  emptyMessage = "No data",
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-base-content/50">{emptyMessage}</div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="table table-zebra">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr
              key={String(item[keyField])}
              className={onRowClick ? "cursor-pointer hover" : ""}
              onClick={() => onRowClick?.(item)}
            >
              {columns.map((col) => (
                <td key={col.key}>
                  {col.render ? col.render(item) : String(item[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
