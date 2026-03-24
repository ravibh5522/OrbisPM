"use client";

import { AlertTriangle, RefreshCcw } from "lucide-react";

export default function ProjectDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-lg rounded-3xl border border-base-200 bg-base-100 p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-warning/15 text-warning">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-bold">Failed to load project</h2>
        <p className="mt-2 text-sm text-base-content/60">
          Something went wrong loading this project. Please try again.
        </p>
        {error.message && (
          <p className="mt-4 rounded-2xl bg-base-200 px-4 py-3 text-left text-xs text-base-content/60">
            {error.message}
          </p>
        )}
        <button className="btn btn-primary mt-6 gap-2" onClick={reset}>
          <RefreshCcw className="h-4 w-4" /> Try again
        </button>
      </div>
    </div>
  );
}
