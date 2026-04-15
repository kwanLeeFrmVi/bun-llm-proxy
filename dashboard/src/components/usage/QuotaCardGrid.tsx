interface QuotaCardGridProps {
  items: Array<{
    label: string;
    value: string;
    sub?: string;
    color?: string;
  }>;
}

export function QuotaCardGrid({ items }: QuotaCardGridProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex flex-col items-center justify-center overflow-hidden rounded-xl bg-card p-6 border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)]"
        >
          <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--on-surface-variant)] font-600">
            {item.label}
          </p>
          <p
            className={`mt-1 font-headline text-[28px] font-700 ${item.color ? "" : "text-[var(--on-surface)]"}`}
            style={item.color ? { color: item.color } : undefined}
          >
            {item.value}
          </p>
          {item.sub && (
            <p className="mt-1 text-[11px] text-[var(--on-surface-variant)]">{item.sub}</p>
          )}
        </div>
      ))}
    </div>
  );
}
