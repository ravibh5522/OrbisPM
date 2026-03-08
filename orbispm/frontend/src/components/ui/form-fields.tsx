"use client";

import { cn } from "@/lib/utils";
import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className, id, ...props }, ref) => {
    const inputId = id || props.name;
    return (
      <div className="form-control w-full">
        {label && (
          <label className="label" htmlFor={inputId}>
            <span className="label-text">{label}</span>
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={cn(
            "input input-bordered w-full",
            error && "input-error",
            className
          )}
          {...props}
        />
        {(error || helperText) && (
          <label className="label">
            <span className={cn("label-text-alt", error ? "text-error" : "text-base-content/60")}>
              {error || helperText}
            </span>
          </label>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const inputId = id || props.name;
    return (
      <div className="form-control w-full">
        {label && (
          <label className="label" htmlFor={inputId}>
            <span className="label-text">{label}</span>
          </label>
        )}
        <textarea
          id={inputId}
          ref={ref}
          className={cn("textarea textarea-bordered w-full", error && "textarea-error", className)}
          {...props}
        />
        {error && (
          <label className="label">
            <span className="label-text-alt text-error">{error}</span>
          </label>
        )}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className, id, ...props }, ref) => {
    const inputId = id || props.name;
    return (
      <div className="form-control w-full">
        {label && (
          <label className="label" htmlFor={inputId}>
            <span className="label-text">{label}</span>
          </label>
        )}
        <select
          id={inputId}
          ref={ref}
          className={cn("select select-bordered w-full", error && "select-error", className)}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && (
          <label className="label">
            <span className="label-text-alt text-error">{error}</span>
          </label>
        )}
      </div>
    );
  }
);
Select.displayName = "Select";

// ─── Password Input with show/hide toggle ────────────────────────────────────

interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ label, error, helperText, className, id, ...props }, ref) => {
    const [show, setShow] = useState(false);
    const inputId = id || props.name;
    return (
      <div className="form-control w-full">
        {label && (
          <label className="label" htmlFor={inputId}>
            <span className="label-text">{label}</span>
          </label>
        )}
        <div className="relative">
          <input
            id={inputId}
            ref={ref}
            type={show ? "text" : "password"}
            className={cn(
              "input input-bordered w-full pr-11",
              error && "input-error",
              className,
            )}
            {...props}
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label={show ? "Hide password" : "Show password"}
            onClick={() => setShow((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content/70 transition-colors focus:outline-none"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {(error || helperText) && (
          <label className="label">
            <span
              className={cn(
                "label-text-alt",
                error ? "text-error" : "text-base-content/60",
              )}
            >
              {error || helperText}
            </span>
          </label>
        )}
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
