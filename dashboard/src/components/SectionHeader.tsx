export function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="border-b border-[rgba(203,213,225,0.4)] px-6 py-4">
      <p className="text-[13px] font-600 text-[var(--on-surface)]">{title}</p>
      {sub && <p className="mt-0.5 text-[11px] text-[var(--on-surface-variant)]">{sub}</p>}
    </div>
  );
}
