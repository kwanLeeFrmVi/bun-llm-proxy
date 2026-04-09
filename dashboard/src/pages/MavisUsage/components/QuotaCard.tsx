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
    <div
      style={{
        background: "var(--surface-container-lowest)",
        borderRadius: "12px",
        padding: "24px",
        border: "1px solid rgba(203,213,225,0.6)",
        boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
        overflow: "hidden",
      }}
    >
      <p
        style={{
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "var(--on-surface-variant)",
          fontWeight: 600,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: "28px",
          fontWeight: 700,
          marginTop: "4px",
          color: color ?? "var(--on-surface)",
          fontFamily: "var(--font-headline)",
        }}
      >
        {value}
      </p>
      {sub && (
        <p
          style={{
            fontSize: "11px",
            color: "var(--on-surface-variant)",
            marginTop: "4px",
          }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}
