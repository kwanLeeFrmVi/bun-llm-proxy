export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const autoColor = color ?? (value > 80 ? "#ef4444" : value > 50 ? "#f59e0b" : "#22c55e");
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[rgba(203,213,225,0.3)]">
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-in-out"
        style={{ width: `${value}%`, background: autoColor }}
      />
    </div>
  );
}