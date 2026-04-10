"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form-fields";
import { api } from "@/lib/api";
import type {
  ExcelColumnMapping,
  ProcessExcelResult,
  SheetImportConfig,
  SheetInfo,
} from "@/types/domain";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";

// Mapping fields users can assign to columns
const MAPPING_FIELDS = [
  { value: "-1", label: "— Skip —" },
  { value: "task", label: "Task (depth 0)" },
  { value: "subtask1", label: "Subtask 1 (depth 1)" },
  { value: "subtask2", label: "Subtask 2 (depth 2)" },
  { value: "subtask3", label: "Subtask 3 (depth 3)" },
  { value: "description", label: "Description" },
  { value: "start_date", label: "Start Date" },
  { value: "end_date", label: "End Date" },
  { value: "priority", label: "Priority" },
  { value: "status", label: "Status" },
  { value: "assignee_email", label: "Assignee Email (comma for multi)" },
] as const;

type MappingField = (typeof MAPPING_FIELDS)[number]["value"];

// Auto-detect mappings from header names
function autoDetectMappings(columns: string[]): Record<number, MappingField> {
  const mapping: Record<number, MappingField> = {};
  const patterns: Array<{ field: MappingField; regex: RegExp }> = [
    { field: "task", regex: /^(task|name|title|summary|item)$/i },
    {
      field: "subtask1",
      regex: /^(sub\s*task\s*1?|child|level\s*1)$/i,
    },
    { field: "subtask2", regex: /^(sub\s*task\s*2|level\s*2)$/i },
    { field: "subtask3", regex: /^(sub\s*task\s*3|level\s*3)$/i },
    {
      field: "description",
      regex: /^(description|desc|details|body|notes?)$/i,
    },
    { field: "start_date", regex: /^(start[_ ]?date|start|begin)$/i },
    {
      field: "end_date",
      regex: /^(end[_ ]?date|due[_ ]?date|deadline|due|finish)$/i,
    },
    {
      field: "priority",
      regex: /^(priority|prio|urgency|importance)$/i,
    },
    {
      field: "status",
      regex: /^(status|state|stage)$/i,
    },
    {
      field: "assignee_email",
      regex: /^(assignee[_ ]?email|email|assigned[_ ]?to|assignee|owner)$/i,
    },
  ];

  const used = new Set<string>();
  columns.forEach((col, i) => {
    const trimmed = col.trim();
    for (const p of patterns) {
      if (p.regex.test(trimmed) && !used.has(p.field)) {
        mapping[i] = p.field;
        used.add(p.field);
        break;
      }
    }
  });
  return mapping;
}

function buildExcelMapping(
  colMapping: Record<number, MappingField>,
): ExcelColumnMapping {
  const m: ExcelColumnMapping = {
    task: -1,
    subtask1: -1,
    subtask2: -1,
    subtask3: -1,
    description: -1,
    start_date: -1,
    end_date: -1,
    priority: -1,
    status: -1,
    assignee_email: -1,
  };
  for (const [idx, field] of Object.entries(colMapping)) {
    if (field !== "-1" && field in m) {
      (m as Record<string, number>)[field] = Number(idx);
    }
  }
  return m;
}

interface ImportDialogProps {
  orgId: string;
  projectId: string;
  open: boolean;
  onClose: () => void;
}

type Step = "upload" | "sheets" | "mapping" | "result";

export function CSVImportDialog({
  orgId,
  projectId,
  open,
  onClose,
}: ImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<Set<string>>(new Set());
  // Per-sheet column mapping: sheetName → { colIndex → MappingField }
  const [sheetMappings, setSheetMappings] = useState<
    Record<string, Record<number, MappingField>>
  >({});
  const [activeSheet, setActiveSheet] = useState<string>("");
  const [result, setResult] = useState<ProcessExcelResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep("upload");
    setFile(null);
    setSheets([]);
    setSelectedSheets(new Set());
    setSheetMappings({});
    setActiveSheet("");
    setResult(null);
    setParseError(null);
    setImporting(false);
    setAnalyzing(false);
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

    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "xlsm"].includes(ext ?? "")) {
      setParseError("Please select an Excel file (.xlsx, .xls, .xlsm).");
      return;
    }

    setFile(f);
    setAnalyzing(true);
    try {
      const sheetInfos = await api.import.analyze(orgId, projectId, f);
      if (!sheetInfos || sheetInfos.length === 0) {
        setParseError("No sheets with data found in this file.");
        setAnalyzing(false);
        return;
      }
      setSheets(sheetInfos);
      // Auto-select all sheets
      setSelectedSheets(new Set(sheetInfos.map((s) => s.name)));
      // Auto-detect mappings per sheet
      const mappings: Record<string, Record<number, MappingField>> = {};
      for (const sheet of sheetInfos) {
        mappings[sheet.name] = autoDetectMappings(sheet.columns);
      }
      setSheetMappings(mappings);
      setActiveSheet(sheetInfos[0].name);
      setStep("sheets");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to analyze file.";
      setParseError(msg);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) {
        const dt = new DataTransfer();
        dt.items.add(f);
        if (fileRef.current) {
          fileRef.current.files = dt.files;
        }
        handleFileSelect({
          target: { files: dt.files },
        } as unknown as React.ChangeEvent<HTMLInputElement>);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgId, projectId],
  );

  const toggleSheet = (name: string) => {
    setSelectedSheets((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const totalRows = sheets
    .filter((s) => selectedSheets.has(s.name))
    .reduce((sum, s) => sum + s.row_count, 0);

  const hasTaskMapping = () => {
    for (const name of selectedSheets) {
      const mapping = sheetMappings[name] ?? {};
      const hasTask = Object.values(mapping).some(
        (f) =>
          f === "task" ||
          f === "subtask1" ||
          f === "subtask2" ||
          f === "subtask3",
      );
      if (!hasTask) return false;
    }
    return selectedSheets.size > 0;
  };

  const handleImport = async () => {
    if (!file || !hasTaskMapping()) return;
    setImporting(true);
    setImportError(null);

    try {
      const config: SheetImportConfig[] = [];
      for (const name of selectedSheets) {
        config.push({
          sheet_name: name,
          mapping: buildExcelMapping(sheetMappings[name] ?? {}),
        });
      }
      const res = await api.import.importExcel(orgId, projectId, file, config);
      setResult(res);
      setStep("result");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Import failed";
      setImportError(msg);
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  return (
    <dialog
      className="modal modal-open"
      style={{ backgroundColor: "transparent" }}
    >
      <div className="modal-box w-11/12 max-w-4xl max-h-[90vh] overflow-y-auto">
        <Button
          variant="ghost"
          size="sm"
          className="btn-circle absolute right-2 top-2"
          onClick={handleClose}
        >
          <X className="w-4 h-4" />
        </Button>

        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5" /> Import Tasks from Excel
        </h3>

        {/* Steps indicator */}
        <ul className="steps steps-horizontal w-full mb-6 text-sm">
          <li
            className={`step ${["upload", "sheets", "mapping", "result"].includes(step) ? "step-primary" : ""}`}
          >
            Upload
          </li>
          <li
            className={`step ${["sheets", "mapping", "result"].includes(step) ? "step-primary" : ""}`}
          >
            Select Sheets
          </li>
          <li
            className={`step ${["mapping", "result"].includes(step) ? "step-primary" : ""}`}
          >
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
            {analyzing ? (
              <>
                <span className="loading loading-spinner loading-lg text-primary mb-4" />
                <p className="text-lg font-medium">Analyzing file...</p>
              </>
            ) : (
              <>
                <Upload className="w-12 h-12 mx-auto text-base-content/40 mb-4" />
                <p className="text-lg font-medium mb-1">
                  Drop an Excel file here or click to browse
                </p>
                <p className="text-sm text-base-content/60">
                  Supports .xlsx, .xls files. First row of each sheet should
                  contain column headers.
                </p>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.xlsm"
              className="hidden"
              onChange={handleFileSelect}
            />
            {parseError && (
              <Alert variant="error" className="mt-4">
                {parseError}
              </Alert>
            )}
          </div>
        )}

        {/* Step 2: Select Sheets */}
        {step === "sheets" && (
          <div>
            <p className="text-sm text-base-content/60 mb-4">
              Select which sheets to import. Each selected sheet will need
              column mapping.
            </p>

            <div className="space-y-2 mb-4">
              {sheets.map((s) => (
                <label
                  key={s.name}
                  className="flex items-center gap-3 p-3 rounded-lg border border-base-300 hover:bg-base-200 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-primary"
                    checked={selectedSheets.has(s.name)}
                    onChange={() => toggleSheet(s.name)}
                  />
                  <div className="flex-1">
                    <span className="font-medium">{s.name}</span>
                    <span className="ml-2 badge badge-ghost badge-sm">
                      {s.row_count} rows
                    </span>
                    <span className="ml-2 badge badge-ghost badge-sm">
                      {s.columns.length} cols
                    </span>
                  </div>
                </label>
              ))}
            </div>

            {totalRows > 200 && (
              <Alert variant="warning" className="mb-4">
                Total rows ({totalRows}) exceeds limit of 200. Only first 200
                tasks will be imported.
              </Alert>
            )}

            <div className="flex justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  reset();
                }}
              >
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (selectedSheets.size > 0) {
                    setActiveSheet([...selectedSheets][0]);
                    setStep("mapping");
                  }
                }}
                disabled={selectedSheets.size === 0}
              >
                <ArrowRight className="w-4 h-4 mr-1" /> Map Columns
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Map Columns */}
        {step === "mapping" && (
          <div>
            {/* Sheet tabs if multiple sheets selected */}
            {selectedSheets.size > 1 && (
              <div role="tablist" className="tabs tabs-bordered mb-4">
                {[...selectedSheets].map((name) => (
                  <a
                    key={name}
                    role="tab"
                    className={`tab ${activeSheet === name ? "tab-active" : ""}`}
                    onClick={() => setActiveSheet(name)}
                  >
                    {name}
                  </a>
                ))}
              </div>
            )}

            <p className="text-sm text-base-content/60 mb-3">
              Map each column to a task field for <strong>{activeSheet}</strong>
              . At least one Task/Subtask column is required per sheet.
            </p>

            {(() => {
              const sheet = sheets.find((s) => s.name === activeSheet);
              const mapping = sheetMappings[activeSheet] ?? {};
              if (!sheet) return null;

              return (
                <div className="overflow-x-auto mb-4">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Column</th>
                        <th>Map To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.columns.map((col, i) => (
                        <tr key={i}>
                          <td className="font-mono text-sm">{col}</td>
                          <td>
                            <Select
                              size="sm"
                              className="w-full max-w-xs"
                              value={mapping[i] ?? "-1"}
                              onChange={(e) => {
                                const val = e.target.value as MappingField;
                                setSheetMappings((prev) => ({
                                  ...prev,
                                  [activeSheet]: {
                                    ...(prev[activeSheet] ?? {}),
                                    [i]: val,
                                  },
                                }));
                              }}
                            >
                              {MAPPING_FIELDS.map((f) => (
                                <option key={f.value} value={f.value}>
                                  {f.label}
                                </option>
                              ))}
                            </Select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {!hasTaskMapping() && (
              <Alert variant="warning" className="mb-4">
                Each selected sheet must have at least one Task or Subtask
                column mapped.
              </Alert>
            )}

            {importError && (
              <Alert variant="error" className="mb-4">
                {importError}
              </Alert>
            )}

            <div className="flex justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep("sheets")}
              >
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button
                size="sm"
                onClick={handleImport}
                disabled={!hasTaskMapping() || importing}
              >
                {importing ? (
                  <span className="loading loading-spinner loading-sm mr-1" />
                ) : (
                  <ArrowRight className="w-4 h-4 mr-1" />
                )}
                {importing
                  ? "Importing..."
                  : `Import ${totalRows > 200 ? 200 : totalRows} Tasks`}
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Results */}
        {step === "result" && result && (
          <div className="text-center">
            {result.job.status === "completed" ? (
              <div className="mb-4">
                <CheckCircle2 className="w-16 h-16 mx-auto text-success mb-3" />
                <h4 className="text-xl font-bold text-success">
                  Import Complete!
                </h4>
              </div>
            ) : result.job.status === "completed_with_errors" ? (
              <div className="mb-4">
                <AlertTriangle className="w-16 h-16 mx-auto text-warning mb-3" />
                <h4 className="text-xl font-bold text-warning">
                  Import Completed with Errors
                </h4>
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
                <div className="stat-value text-lg">
                  {result.job.total_rows ?? 0}
                </div>
              </div>
              <div className="stat">
                <div className="stat-title">Created</div>
                <div className="stat-value text-lg text-success">
                  {result.job.processed_rows}
                </div>
              </div>
              <div className="stat">
                <div className="stat-title">Errors</div>
                <div className="stat-value text-lg text-error">
                  {result.job.error_rows}
                </div>
              </div>
            </div>

            {/* Assignments */}
            {result.assignments && result.assignments.length > 0 && (
              <div className="mb-4 text-left">
                <h5 className="font-semibold mb-2">
                  Assigned Users ({result.assignments.length}):
                </h5>
                <div className="max-h-40 overflow-y-auto bg-base-200 rounded-lg p-3">
                  <table className="table table-xs">
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Task</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.assignments.map((a, i) => (
                        <tr key={i}>
                          <td className="text-sm">{a.email}</td>
                          <td className="text-sm">{a.task_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Error details */}
            {result.job.errors && result.job.errors.length > 0 && (
              <div className="mb-4 text-left">
                <h5 className="font-semibold mb-2">Error Details:</h5>
                <div className="max-h-40 overflow-y-auto bg-base-200 rounded-lg p-3">
                  {result.job.errors.map((err, i) => (
                    <div
                      key={i}
                      className="text-sm py-1 border-b border-base-300 last:border-0"
                    >
                      <span className="font-mono text-error">
                        Row {String(err.row)}:
                      </span>{" "}
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
