"use client";

import { cn } from "@/lib/utils";
import { Check, ChevronDown, Eye, EyeOff } from "lucide-react";
import { forwardRef, useCallback, useEffect, useRef, useState } from "react";

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
            className,
          )}
          {...props}
        />
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
          className={cn(
            "textarea textarea-bordered w-full",
            error && "textarea-error",
            className,
          )}
          {...props}
        />
        {error && (
          <label className="label">
            <span className="label-text-alt text-error">{error}</span>
          </label>
        )}
      </div>
    );
  },
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
          className={cn(
            "select select-bordered w-full",
            error && "select-error",
            className,
          )}
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
  },
);
Select.displayName = "Select";

// ─── Password Input with show/hide toggle ────────────────────────────────────

interface PasswordInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
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
            {show ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
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

// ─── DatePicker ───────────────────────────────────────────────────────────────

interface DatePickerProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
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
          type="date"
          className={cn(
            "input input-bordered w-full",
            error && "input-error",
            className,
          )}
          {...props}
        />
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
DatePicker.displayName = "DatePicker";

// ─── Combobox ─────────────────────────────────────────────────────────────────

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  label?: string;
  error?: string;
  helperText?: string;
  options: ComboboxOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  /** Allow selecting a value not in the options list */
  allowFreeInput?: boolean;
}

export function Combobox({
  label,
  error,
  helperText,
  options,
  value,
  onChange,
  placeholder = "Select…",
  className,
  disabled,
  id,
  name,
  allowFreeInput = false,
}: ComboboxProps) {
  const inputId = id || name;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedLabel =
    options.find((o) => o.value === value)?.label ?? value ?? "";

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSelect = useCallback(
    (optValue: string) => {
      onChange?.(optValue);
      setOpen(false);
      setSearch("");
    },
    [onChange],
  );

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSearch("");
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="form-control w-full" ref={containerRef}>
      {label && (
        <label className="label" htmlFor={inputId}>
          <span className="label-text">{label}</span>
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          id={inputId}
          disabled={disabled}
          aria-expanded={open}
          className={cn(
            "input input-bordered w-full flex items-center justify-between text-left pr-10",
            error && "input-error",
            !selectedLabel && "text-base-content/40",
            className,
          )}
          onClick={() => {
            if (!disabled) setOpen((o) => !o);
          }}
        >
          <span className="truncate">{selectedLabel || placeholder}</span>
          <ChevronDown
            className={cn(
              "absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40 transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
        {open && (
          <div className="absolute z-50 mt-1 w-full bg-base-100 border border-base-200 rounded-box shadow-lg overflow-hidden">
            {/* Search input inside dropdown */}
            <div className="p-2 border-b border-base-200">
              <input
                autoFocus
                type="text"
                className="input input-sm input-bordered w-full"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setOpen(false);
                    setSearch("");
                  }
                  if (e.key === "Enter" && filtered.length > 0) {
                    handleSelect(filtered[0].value);
                  }
                }}
              />
            </div>
            <ul className="max-h-52 overflow-y-auto py-1">
              {filtered.length === 0 && (
                <li className="px-4 py-2 text-sm text-base-content/40">
                  {allowFreeInput ? (
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => handleSelect(search)}
                    >
                      Use &ldquo;{search}&rdquo;
                    </button>
                  ) : (
                    "No options"
                  )}
                </li>
              )}
              {filtered.map((opt) => (
                <li key={opt.value}>
                  <button
                    type="button"
                    className={cn(
                      "w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-base-200 transition-colors",
                      value === opt.value && "text-primary font-medium",
                    )}
                    onClick={() => handleSelect(opt.value)}
                  >
                    <Check
                      className={cn(
                        "w-3.5 h-3.5 flex-shrink-0",
                        value === opt.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {opt.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
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
}
