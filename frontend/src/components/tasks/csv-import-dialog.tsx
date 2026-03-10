"use client";

import { useState, useRef, useCallback } from "react";
import { api } from "@/lib/api"; // kept for CSV file upload (binary)
import { Button } from "@/components/ui/button";
import {
  Upload,
  FileSpreadsheet,
  X,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import type { ImportJob } from "@/types/domain";

// Task fields that can be mapped to CSV columns
const TASK_FIELDS = [
  { value: "", label: "— Skip —" },
  { value: "title", label: "Title (required)" },
  { value: "description", label: "Description" },
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "due_date", label: "Due Date" },
  { value: "start_date", label: "Start Date" },
  { value: "labels", label: "Labels" },
];

// Auto-detect mapping from common header names
function autoDetectMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const patterns: Record<string, RegExp> = {
    title: /^(title|name|task|summary|subject)$/i,
    description: /^(description|desc|details|body|content|notes?)$/i,
    status: /^(status|state|stage)$/i,
    priority: /^(priority|prio|urgency|importance|severity)$/i,
    due_date: /^(due[_ ]?date|deadline|due|end[_ ]?date)$/i,
    start_date: /^(start[_ ]?date|start|begin[_ ]?date)$/i,
    labels: /^(labels?|tags?|categories?|category)$/i,
  };

  for (const header of headers) {
    const trimmed = header.trim();
    for (const [field, regex] of Object.entries(patterns)) {
      if (regex.test(trimmed) && !Object.values(mapping).includes(field)) {
        mapping[trimmed] = field;
        break;
      }
    }
  }
  return mapping;
}

// Parse CSV text into headers + rows
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [] };

  // Simple CSV parsing (handles quoted fields)
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

interface CSVImportDialogProps {
  orgId: string;
  projectId: string;
  open: boolean;
  onClose: () => void;
}

type Step = "upload" | "mapping" | "result";

export function CSVImportDialog({ orgId, projectId, open, onClose }: CSVImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportJob | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<Error | null>(null);

  const startImport = async (f: File, m: Record<string, string>) => {
    setImporting(true);
    setImportError(null);
    try {
      const job = await api.import.start(orgId, projectId, f, m);
      setResult(job);
      setStep("result");
    } catch (e: any) {
      setImportError(e);
    } finally {
      setImporting(false);
    }
  };

  const reset = useCallback(() => {
    setStep("upload");
    setFile(null);
    setHeaders([]);
    setPreviewRows([]);
    setMapping({});
    setResult(null);
    setParseError(null);
    setImporting(false);
    setImportError(null);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    setParseError(null);

    if (!f.name.endsWith(".csv") && !f.type.includes("csv") && !f.type.includes("text/plain")) {
      setParseError("Please select a CSV file.");
      return;
    }

    try {
      const text = await f.text();
      const { headers: h, rows } = parseCSV(text);

      if (h.length === 0) {
        setParseError("CSV file is empty or has no headers.");
        return;
      }

      setFile(f);
      setHeaders(h);
      setPreviewRows(rows.slice(0, 5));
      setMapping(autoDetectMapping(h));
      setStep("mapping");
    } catch {
      setParseError("Failed to read file.");
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) {
        // Create synthetic event
        const dt = new DataTransfer();
        dt.items.add(f);
        if (fileRef.current) {
          fileRef.current.files = dt.files;
          fileRef.current.dispatchEvent(new Event("change", { bubbles: true }));
        }
        // Directly handle
        handleFileSelect({ target: { files: dt.files } } as unknown as React.ChangeEvent<HTMLInputElement>);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const hasTitleMapping = Object.values(mapping).includes("title");

  const handleImport = () => {
    if (!file || !hasTitleMapping) return;
    // Filter out unmapped columns
    const cleanMapping: Record<string, string> = {};
    for (const [header, field] of Object.entries(mapping)) {
      if (field) cleanMapping[header] = field;
    }
    startImport(file, cleanMapping);
  };

  if (!open) return null;

  return (
    <dialog className="modal modal-open" style={{ backgroundColor: "transparent" }}>
      <div className="modal-box w-11/12 max-w-3xl">
        <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onClick={handleClose}>
          <X className="w-4 h-4" />
        </button>

        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5" /> Import Tasks from CSV
        </h3>

        {/* Steps indicator */}
        <ul className="steps steps-horizontal w-full mb-6">
          <li className={`step ${step === "upload" || step === "mapping" || step === "result" ? "step-primary" : ""}`}>
            Upload
          </li>
          <li className={`step ${step === "mapping" || step === "result" ? "step-primary" : ""}`}>
            Map Columns
          </li>
          <li className={`step ${step === "result" ? "step-primary" : ""}`}>
            Results
          </li>
        </ul>

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div
            className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-12 h-12 mx-auto text-base-content/40 mb-4" />
            <p className="text-lg font-medium mb-1">Drop a CSV file here or click to browse</p>
            <p className="text-sm text-base-content/60">
              Supports .csv files. First row should contain column headers.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFileSelect}
            />
            {parseError && (
              <div className="alert alert-error mt-4">
                <AlertTriangle className="w-4 h-4" />
                <span>{parseError}</span>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Column Mapping */}
        {step === "mapping" && (
          <div>
            <p className="text-sm text-base-content/60 mb-4">
              Map each CSV column to a task field. At least <strong>Title</strong> is required.
            </p>

            {/* Mapping table */}
            <div className="overflow-x-auto mb-4">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>CSV Column</th>
                    <th>Sample Data</th>
                    <th>Map To</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((h, i) => (
                    <tr key={i}>
                      <td className="font-mono text-sm">{h}</td>
                      <td className="text-sm text-base-content/60 max-w-[200px] truncate">
                        {previewRows[0]?.[i] || "—"}
                      </td>
                      <td>
                        <select
                          className="select select-bordered select-sm w-full max-w-xs"
                          value={mapping[h] || ""}
                          onChange={(e) =>
                            setMapping((prev) => ({ ...prev, [h]: e.target.value }))
                          }
                        >
                          {TASK_FIELDS.map((f) => (
                            <option key={f.value} value={f.value}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Preview table */}
            {previewRows.length > 0 && (
              <div className="collapse collapse-arrow bg-base-200 mb-4">
                <input type="checkbox" />
                <div className="collapse-title text-sm font-medium">
                  Preview ({previewRows.length} of {previewRows.length}+ rows)
                </div>
                <div className="collapse-content overflow-x-auto">
                  <table className="table table-xs">
                    <thead>
                      <tr>
                        {headers.map((h, i) => (
                          <th key={i} className="text-xs">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, ri) => (
                        <tr key={ri}>
                          {headers.map((_, ci) => (
                            <td key={ci} className="text-xs max-w-[150px] truncate">
                              {row[ci] || ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!hasTitleMapping && (
              <div className="alert alert-warning mb-4">
                <AlertTriangle className="w-4 h-4" />
                <span>You must map at least one column to <strong>Title</strong>.</span>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={() => { reset(); setStep("upload"); }}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button
                size="sm"
                onClick={handleImport}
                disabled={!hasTitleMapping || importing}
              >
                {importing ? (
                  <span className="loading loading-spinner loading-sm mr-1" />
                ) : (
                  <ArrowRight className="w-4 h-4 mr-1" />
                )}
                {importing ? "Importing..." : "Import Tasks"}
              </Button>
            </div>

            {importError && (
              <div className="alert alert-error text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>{importError.message || "Import failed"}</span>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Results */}
        {step === "result" && result && (
          <div className="text-center">
            {result.status === "completed" ? (
              <div className="mb-4">
                <CheckCircle2 className="w-16 h-16 mx-auto text-success mb-3" />
                <h4 className="text-xl font-bold text-success">Import Complete!</h4>
              </div>
            ) : result.status === "completed_with_errors" ? (
              <div className="mb-4">
                <AlertTriangle className="w-16 h-16 mx-auto text-warning mb-3" />
                <h4 className="text-xl font-bold text-warning">Import Completed with Errors</h4>
              </div>
            ) : (
              <div className="mb-4">
                <X className="w-16 h-16 mx-auto text-error mb-3" />
                <h4 className="text-xl font-bold text-error">Import Failed</h4>
              </div>
            )}

            {/* Stats */}
            <div className="stats shadow mb-6">
              <div className="stat">
                <div className="stat-title">Total Rows</div>
                <div className="stat-value text-lg">{result.total_rows ?? 0}</div>
              </div>
              <div className="stat">
                <div className="stat-title">Created</div>
                <div className="stat-value text-lg text-success">{result.processed_rows}</div>
              </div>
              <div className="stat">
                <div className="stat-title">Errors</div>
                <div className="stat-value text-lg text-error">{result.error_rows}</div>
              </div>
            </div>

            {/* Error details */}
            {result.errors && result.errors.length > 0 && (
              <div className="mb-4 text-left">
                <h5 className="font-semibold mb-2">Error Details:</h5>
                <div className="max-h-40 overflow-y-auto bg-base-200 rounded-lg p-3">
                  {result.errors.map((err, i) => (
                    <div key={i} className="text-sm py-1 border-b border-base-300 last:border-0">
                      <span className="font-mono text-error">Row {String(err.row)}:</span>{" "}
                      {String(err.error)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button size="sm" onClick={handleClose}>
              Done
            </Button>
          </div>
        )}
      </div>
      <form method="dialog" className="modal-backdrop bg-transparent">
        <button onClick={handleClose}>close</button>
      </form>
    </dialog>
  );
}
