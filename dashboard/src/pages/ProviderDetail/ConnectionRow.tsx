import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { ChevronUp, ChevronDown, Pencil, Trash2, Play, Loader2 } from "lucide-react";
import type { ProviderConnection } from "@/lib/api";
import { statusVariant, statusLabel, statusColor } from "./utils";
import type { ConnectionRowProps } from "./types";

export function ConnectionRow({
  conn,
  isFirst,
  isLast,
  isAdmin,
  onMoveUp,
  onMoveDown,
  onToggle,
  onEdit,
  onDelete,
  onTest,
}: ConnectionRowProps) {
  const [testing, setTesting] = useState(false);
  const variant = statusVariant(conn);
  const label = statusLabel(conn);
  const color = statusColor(variant);
  const dotColor =
    variant === "success"
      ? "bg-green-500"
      : variant === "error"
        ? "bg-red-500"
        : "bg-gray-400";

  const handleTestClick = async () => {
    setTesting(true);
    try {
      onTest(conn.id);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 hover:bg-[--surface-container-low]/50 transition-colors ${conn.isActive === false ? "opacity-60" : ""}`}
    >
      {/* Priority reorder */}
      <div className='flex flex-col shrink-0'>
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className={`p-0.5 rounded ${isFirst ? "text-[--on-surface-variant]/30" : "text-[--on-surface-variant] hover:text-[--on-surface]"}`}
        >
          <ChevronUp className='w-3.5 h-3.5' />
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className={`p-0.5 rounded ${isLast ? "text-[--on-surface-variant]/30" : "text-[--on-surface-variant] hover:text-[--on-surface]"}`}
        >
          <ChevronDown className='w-3.5 h-3.5' />
        </button>
      </div>

      {/* Lock/key icon */}
      <span className='text-[--on-surface-variant] shrink-0'>
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
        >
          <rect width='18' height='11' x='3' y='11' rx='2' ry='2' />
          <path d='M7 11V7a5 5 0 0 1 10 0v4' />
        </svg>
      </span>

      {/* Name + status */}
      <div className='flex-1 min-w-0'>
        <p className='text-sm font-medium text-[--on-surface] truncate'>
          {conn.name}
        </p>
        <div className='flex items-center gap-2 mt-0.5'>
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
            {label}
          </span>
          {conn.lastError && (
            <span
              className='text-xs text-red-500 truncate max-w-[250px]'
              title={conn.lastError}
            >
              {conn.lastError}
            </span>
          )}
          <span className='text-xs text-[--on-surface-variant]'>
            #{conn.priority}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className='flex items-center gap-1 shrink-0'>
        {/* Test button */}
        <button
          onClick={handleTestClick}
          disabled={testing}
          className='flex flex-col items-center px-2 py-1 rounded text-[--on-surface-variant] hover:text-[--on-surface] hover:bg-[--surface-container-low]'
          title='Test connection'
        >
          {testing ? (
            <Loader2 className='w-3.5 h-3.5 animate-spin' />
          ) : (
            <Play className='w-3.5 h-3.5' />
          )}
          <span className='text-[10px] leading-tight'>Test</span>
        </button>
        <button
          onClick={onEdit}
          className='flex flex-col items-center px-2 py-1 rounded text-[--on-surface-variant] hover:text-[--on-surface] hover:bg-[--surface-container-low]'
          title='Edit'
        >
          <Pencil className='w-3.5 h-3.5' />
          <span className='text-[10px] leading-tight'>Edit</span>
        </button>
        {isAdmin && (
          <button
            onClick={onDelete}
            className='flex flex-col items-center px-2 py-1 rounded text-red-500 hover:bg-red-50'
            title='Delete'
          >
            <Trash2 className='w-3.5 h-3.5' />
            <span className='text-[10px] leading-tight'>Delete</span>
          </button>
        )}
        <Switch checked={conn.isActive !== false} onCheckedChange={onToggle} />
      </div>
    </div>
  );
}
