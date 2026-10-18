"use client";

import { cn } from "@/lib/utils";
import { CloudUpload } from "lucide-react";
import { useRef, useState, type RefObject } from "react";

interface DriveDropzoneProps {
  enabled: boolean;
  onFiles: (files: File[]) => void;
  /** Hidden file input; the toolbar's Upload button clicks it. */
  inputRef: RefObject<HTMLInputElement | null>;
  className?: string;
  children: React.ReactNode;
}

// Only OS file drags carry the "Files" type; text, links and in-app drags
// (e.g. task cards) must pass through untouched.
const isFileDrag = (e: React.DragEvent) =>
  Array.from(e.dataTransfer.types).includes("Files");

export function DriveDropzone({
  enabled,
  onFiles,
  inputRef,
  className,
  children,
}: DriveDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave fire for every child element; count them so the
  // overlay doesn't flicker while moving across rows.
  const depth = useRef(0);

  const reset = () => {
    depth.current = 0;
    setDragging(false);
  };

  return (
    <div
      className={cn("relative", className)}
      onDragEnter={(e) => {
        if (!enabled || !isFileDrag(e)) return;
        e.preventDefault();
        depth.current++;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (!enabled || !isFileDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (!enabled || !isFileDrag(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        if (!enabled || !isFileDrag(e)) return;
        e.preventDefault();
        reset();
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) onFiles(files);
      }}
    >
      {children}

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />

      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm text-primary">
          <CloudUpload className="w-10 h-10" />
          <p className="text-sm font-semibold">Drop files to upload</p>
        </div>
      )}
    </div>
  );
}
