"use client";

import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

export function Modal({ open, onClose, title, children, className, actions }: ModalProps) {
  if (!open) return null;

  return (
    <dialog className="modal modal-open" style={{ backgroundColor: "transparent" }}>
      <div className={cn("modal-box shadow-2xl", className)}>
        {title && <h3 className="font-bold text-lg mb-4">{title}</h3>}
        {children}
        {actions && <div className="modal-action">{actions}</div>}
      </div>
      <div className="modal-backdrop" style={{ background: "transparent" }} onClick={onClose} />
    </dialog>
  );
}
