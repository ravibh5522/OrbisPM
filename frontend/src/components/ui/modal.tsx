"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  actions,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Inner widgets (comboboxes, search inputs) claim Escape via preventDefault.
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <dialog
      className="modal modal-open"
      style={{ backgroundColor: "transparent" }}
    >
      <div className={cn("modal-box shadow-2xl", className)}>
        {title && <h3 className="font-bold text-lg mb-4">{title}</h3>}
        {children}
        {actions && <div className="modal-action">{actions}</div>}
      </div>
      <div
        className="modal-backdrop"
        style={{ background: "transparent" }}
        onClick={onClose}
      />
    </dialog>,
    document.body,
  );
}
