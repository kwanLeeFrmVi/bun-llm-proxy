export function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div
      style={{
        padding: "16px 24px",
        borderBottom: "1px solid rgba(203,213,225,0.4)",
      }}
    >
      <p
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color: "var(--on-surface)",
        }}
      >
        {title}
      </p>
      {sub && (
        <p
          style={{
            fontSize: "11px",
            color: "var(--on-surface-variant)",
            marginTop: "2px",
          }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}
