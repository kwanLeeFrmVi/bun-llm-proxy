export function ProgressBar({ value }: { value: number }) {
  const color = value > 80 ? "#ef4444" : value > 50 ? "#f59e0b" : "#22c55e";
  return (
    <div
      style={{
        marginTop: "12px",
        height: "6px",
        borderRadius: "9999px",
        background: "rgba(203,213,225,0.3)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: value + "%",
          borderRadius: "9999px",
          background: color,
          transition: "width 0.5s ease",
        }}
      />
    </div>
  );
}
