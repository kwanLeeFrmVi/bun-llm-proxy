export function QuotaCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center overflow-hidden rounded-xl bg-[var(--surface-container-lowest)] p-6 border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--on-surface-variant)] font-600">
        {label}
      </p>
      <p className={`mt-1 font-headline text-[28px] font-700 ${color ?? "text-[var(--on-surface)]"}`}>
        {value}
      </p>
      {sub && (
        <p className="mt-1 text-[11px] text-[var(--on-surface-variant)]">
          {sub}
        </p>
      )}
    </div>
  );
}
