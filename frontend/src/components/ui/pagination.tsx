"use client";

import { Button } from "@/components/ui/button";
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowJump((prev) => !prev)}
        >
          Go to
        </Button>

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
            <Button type="button" size="sm" onClick={handleJump}>
              Go
            </Button>
          </div>
        )}

        <div className="join">
          <Button
            size="sm"
            variant="ghost"
            className="join-item"
            disabled={page === 0}
            onClick={() => onPageChange(0)}
          >
            &laquo;
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="join-item"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
          >
            &lsaquo;
          </Button>
          <Button size="sm" variant="ghost" className="join-item">
            Page {page + 1} of {totalPages}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="join-item"
            disabled={page >= totalPages - 1}
            onClick={() => onPageChange(page + 1)}
          >
            &rsaquo;
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="join-item"
            disabled={page >= totalPages - 1}
            onClick={() => onPageChange(totalPages - 1)}
          >
            &raquo;
          </Button>
        </div>
      </div>
    </div>
  );
}
