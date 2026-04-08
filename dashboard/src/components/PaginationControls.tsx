import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  label?: string;
}

export function PaginationControls({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  label = "RECORDS",
}: PaginationControlsProps) {
  const start = Math.min(page * pageSize + 1, total);
  const end = Math.min((page + 1) * pageSize, total);

  // Generate page numbers to display (max 7 slots with ellipsis)
  function getPageNumbers(): (number | "ellipsis")[] {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i);
    }

    const pages: (number | "ellipsis")[] = [0];

    if (page > 2) {
      pages.push("ellipsis");
    }

    const rangeStart = Math.max(1, page - 1);
    const rangeEnd = Math.min(totalPages - 2, page + 1);

    for (let i = rangeStart; i <= rangeEnd; i++) {
      pages.push(i);
    }

    if (page < totalPages - 3) {
      pages.push("ellipsis");
    }

    pages.push(totalPages - 1);

    return pages;
  }

  return (
    <div className="px-6 py-3 border-t border-[rgba(203,213,225,0.4)] flex flex-col sm:flex-row items-center justify-between gap-3">
      <p className="text-[11px] text-[--on-surface-variant] font-medium tracking-wide">
        SHOWING {start}–{end} OF {total.toLocaleString()} {label}
      </p>
      <div className="flex items-center gap-1">
        <button
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[--surface-container-low] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-[--on-surface-variant]" />
        </button>

        {getPageNumbers().map((p, idx) =>
          p === "ellipsis" ? (
            <span
              key={`ellipsis-${idx}`}
              className="h-7 w-7 flex items-center justify-center text-[12px] text-[--on-surface-variant]"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`h-7 min-w-[28px] px-1 flex items-center justify-center rounded-md text-[12px] font-medium transition-colors ${
                p === page
                  ? "bg-[--primary] text-white"
                  : "text-[--on-surface-variant] hover:bg-[--surface-container-low]"
              }`}
            >
              {p + 1}
            </button>
          ),
        )}

        <button
          disabled={page + 1 >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[--surface-container-low] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-[--on-surface-variant]" />
        </button>
      </div>
    </div>
  );
}