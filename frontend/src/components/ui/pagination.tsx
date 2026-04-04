"use client";

import { useEffect, useState } from "react";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  className,
}: PaginationProps) {
  const [showJump, setShowJump] = useState(false);
  const [jumpPage, setJumpPage] = useState(String(page + 1));

  useEffect(() => {
    setJumpPage(String(page + 1));
  }, [page]);

  if (totalPages <= 1) return null;

  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);

  const handleJump = () => {
    const parsed = Number.parseInt(jumpPage, 10);
    if (Number.isNaN(parsed)) return;

    const bounded = Math.min(Math.max(parsed, 1), totalPages);
    onPageChange(bounded - 1);
    setJumpPage(String(bounded));
  };

  return (
    <div
      className={`flex items-center justify-between mt-4 pt-3 border-t border-base-200 ${className ?? ""}`}
    >
      <span className="text-sm text-base-content/60">
        Showing {start}&ndash;{end} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => setShowJump((prev) => !prev)}
        >
          Go to
        </button>

        {showJump && (
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={totalPages}
              value={jumpPage}
              onChange={(e) => setJumpPage(e.target.value)}
              className="input input-bordered input-sm w-20"
              aria-label="Go to page number"
            />
            <button type="button" className="btn btn-sm" onClick={handleJump}>
              Go
            </button>
          </div>
        )}

        <div className="join">
        <button
          className="join-item btn btn-sm"
          disabled={page === 0}
          onClick={() => onPageChange(0)}
        >
          &laquo;
        </button>
        <button
          className="join-item btn btn-sm"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
        >
          &lsaquo;
        </button>
        <button className="join-item btn btn-sm">
          Page {page + 1} of {totalPages}
        </button>
        <button
          className="join-item btn btn-sm"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
        >
          &rsaquo;
        </button>
        <button
          className="join-item btn btn-sm"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(totalPages - 1)}
        >
          &raquo;
        </button>
        </div>
      </div>
    </div>
  );
}
