"use client";

import { Button } from "@/components/ui/button";
import { RepeatIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

interface RecurrenceConfig {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
}

interface RecurrenceSelectorProps {
  value?: string | null;
  onChange: (rule: string | null) => void;
}

const FREQ_OPTIONS = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
] as const;

// Parse RRULE string into config object
function parseRRule(rrule: string | null | undefined): RecurrenceConfig | null {
  if (!rrule) return null;

  let freq: RecurrenceConfig["freq"] = "DAILY";
  let interval = 1;

  for (const part of rrule.split(";")) {
    const [key, val] = part.split("=");
    if (
      key === "FREQ" &&
      ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(val)
    ) {
      freq = val as RecurrenceConfig["freq"];
    }
    if (key === "INTERVAL") {
      const parsed = parseInt(val, 10);
      if (!isNaN(parsed) && parsed > 0) interval = parsed;
    }
  }

  return { freq, interval };
}

// Build RRULE string from config
function buildRRule(config: RecurrenceConfig): string {
  if (config.interval === 1) {
    return `FREQ=${config.freq}`;
  }
  return `FREQ=${config.freq};INTERVAL=${config.interval}`;
}

// Get human-readable recurrence text
function getRecurrenceText(rrule: string | null | undefined): string {
  const config = parseRRule(rrule);
  if (!config) return "No recurrence";

  const interval = config.interval;
  switch (config.freq) {
    case "DAILY":
      return interval === 1 ? "Every day" : `Every ${interval} days`;
    case "WEEKLY":
      return interval === 1 ? "Every week" : `Every ${interval} weeks`;
    case "MONTHLY":
      return interval === 1 ? "Every month" : `Every ${interval} months`;
    case "YEARLY":
      return interval === 1 ? "Every year" : `Every ${interval} years`;
  }
}

export function RecurrenceSelector({
  value,
  onChange,
}: RecurrenceSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<RecurrenceConfig>(
    () => parseRRule(value) || { freq: "WEEKLY", interval: 1 },
  );

  useEffect(() => {
    const parsed = parseRRule(value);
    if (parsed) {
      setConfig(parsed);
    }
  }, [value]);

  const hasRecurrence = !!value;

  const handleSave = () => {
    onChange(buildRRule(config));
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <Button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        variant="ghost"
        size="sm"
        className={`gap-2 ${hasRecurrence ? "text-primary" : ""}`}
      >
        <RepeatIcon className="w-4 h-4" />
        <span className="text-xs">{getRecurrenceText(value)}</span>
      </Button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-base-100 border border-base-300 rounded-lg shadow-lg p-4 min-w-64">
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-medium text-sm">Recurrence</h4>
            <Button
              type="button"
              onClick={() => setIsOpen(false)}
              variant="ghost"
              size="xs"
              className="btn-circle"
            >
              <XIcon className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-3">
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs">Repeat every</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={config.interval}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      interval: Math.max(1, parseInt(e.target.value) || 1),
                    }))
                  }
                  className="input input-bordered input-sm w-20"
                />
                <select
                  value={config.freq}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      freq: e.target.value as RecurrenceConfig["freq"],
                    }))
                  }
                  className="select select-bordered select-sm flex-1"
                >
                  {FREQ_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-between gap-2 pt-2 border-t border-base-300">
              {hasRecurrence && (
                <Button
                  type="button"
                  onClick={handleClear}
                  variant="ghost"
                  size="sm"
                  className="text-error"
                >
                  Remove
                </Button>
              )}
              <Button
                type="button"
                onClick={handleSave}
                size="sm"
                className="ml-auto"
              >
                {hasRecurrence ? "Update" : "Set"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Simple display badge for showing recurrence status
export function RecurrenceBadge({ rule }: { rule?: string | null }) {
  if (!rule) return null;

  return (
    <span className="badge badge-outline badge-sm gap-1">
      <RepeatIcon className="w-3 h-3" />
      {getRecurrenceText(rule)}
    </span>
  );
}
