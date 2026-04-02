"use client";

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
  if (totalPages <= 1) return null;

  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);

  return (
    <div
      className={`flex items-center justify-between mt-4 pt-3 border-t border-base-200 ${className ?? ""}`}
    >
      <span className="text-sm text-base-content/60">
        Showing {start}&ndash;{end} of {total}
      </span>
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
  );
}
