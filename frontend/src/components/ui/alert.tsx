"use client";

import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle, Info, X, XCircle } from "lucide-react";
import type { ReactNode } from "react";

export type AlertVariant = "info" | "success" | "warning" | "error";

const VARIANT_CLASS: Record<AlertVariant, string> = {
  info: "alert-info",
  success: "alert-success",
  warning: "alert-warning",
  error: "alert-error",
};

const VARIANT_ICON: Record<AlertVariant, ReactNode> = {
  info: <Info className="w-5 h-5 flex-shrink-0" />,
  success: <CheckCircle className="w-5 h-5 flex-shrink-0" />,
  warning: <AlertTriangle className="w-5 h-5 flex-shrink-0" />,
  error: <XCircle className="w-5 h-5 flex-shrink-0" />,
};

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  icon?: ReactNode | false;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Shared Alert / Banner component — wraps DaisyUI `alert`.
 *
 * Usage:
 *   <Alert variant="warning" title="Heads up" onDismiss={() => setShow(false)}>
 *     Your free trial expires in 3 days.
 *   </Alert>
 */
export function Alert({
  variant = "info",
  title,
  children,
  icon,
  onDismiss,
  className,
}: AlertProps) {
  const defaultIcon = VARIANT_ICON[variant];
  const resolvedIcon = icon === false ? null : (icon ?? defaultIcon);

  return (
    <div
      role="alert"
      className={cn("alert", VARIANT_CLASS[variant], className)}
    >
      {resolvedIcon}
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold text-sm leading-snug">{title}</p>}
        <div className="text-sm">{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss alert"
          className="btn btn-ghost btn-sm btn-circle ml-1 flex-shrink-0"
          onClick={onDismiss}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
