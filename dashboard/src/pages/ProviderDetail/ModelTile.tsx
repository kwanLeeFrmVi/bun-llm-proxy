import { Copy, Play, Loader2, Trash2 } from "lucide-react";
import type { ModelTileProps } from "./types";

export function ModelTile({
  modelId,
  alias,
  onCopy,
  copied,
  onTest,
  isTesting,
  testStatus,
  onDelete,
}: ModelTileProps) {
  const borderColor =
    testStatus === "ok"
      ? "border-green-500/40"
      : testStatus === "error"
        ? "border-red-500/40"
        : "border-[rgba(203,213,225,0.4)]";

  const iconColor =
    testStatus === "ok"
      ? "text-green-600"
      : testStatus === "error"
        ? "text-red-500"
        : "text-[--on-surface-variant]";

  return (
    <div
      className={`group flex items-center gap-2 px-3 py-2 rounded-lg border ${borderColor} hover:bg-[--surface-container-low]/50 transition-colors`}
    >
      <svg
        xmlns='http://www.w3.org/2000/svg'
        width='16'
        height='16'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='2'
        strokeLinecap='round'
        strokeLinejoin='round'
        className={`shrink-0 ${iconColor}`}
      >
        <path d='M12 8V4H8' />
        <rect width='16' height='12' x='4' y='8' rx='2' />
        <path d='M2 14h2' />
        <path d='M20 14h2' />
        <path d='M15 13v2' />
        <path d='M9 13v2' />
      </svg>
      <code className='text-xs font-mono text-[--on-surface] flex-1 truncate'>
        {alias ?? modelId}
      </code>
      {onTest && (
        <button
          onClick={onTest}
          disabled={isTesting}
          className='shrink-0 text-[--on-surface-variant] hover:text-[--on-surface] disabled:opacity-50'
          title={isTesting ? "Testing..." : "Test model"}
        >
          {isTesting ? (
            <Loader2 className='w-3.5 h-3.5 animate-spin' />
          ) : testStatus === "ok" ? (
            <span className='text-xs text-green-600'>ok</span>
          ) : testStatus === "error" ? (
            <span className='text-xs text-red-500'>err</span>
          ) : (
            <Play className='w-3.5 h-3.5' />
          )}
        </button>
      )}
      {onDelete && (
        <button
          onClick={onDelete}
          className='shrink-0 text-[--on-surface-variant] hover:text-red-500'
          title='Delete model'
        >
          <Trash2 className='w-3.5 h-3.5' />
        </button>
      )}
      <button
        onClick={() => onCopy(alias ?? modelId)}
        className='shrink-0 text-[--on-surface-variant] hover:text-[--on-surface]'
        title='Copy'
      >
        {copied === (alias ?? modelId) ? (
          <span className='text-xs text-green-600'>ok</span>
        ) : (
          <Copy className='w-3.5 h-3.5' />
        )}
      </button>
    </div>
  );
}
