import { useState, useEffect } from "react";

export function CountdownCard({ target, sub }: { target: string; sub?: string }) {
  const [timeLeft, setTimeLeft] = useState("-");

  useEffect(() => {
    if (!target) {
      setTimeLeft("-");
      return;
    }

    const calculateTimeLeft = () => {
      const targetDate = new Date(target).getTime();
      const now = Date.now();
      const diff = targetDate - now;

      if (diff <= 0) {
        return "Reset now";
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
      );
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
      }
      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      }
      return `${minutes}m`;
    };

    setTimeLeft(calculateTimeLeft());
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 60000);

    return () => clearInterval(timer);
  }, [target]);

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
        Resets In
      </p>
      <p
        style={{
          fontSize: "28px",
          fontWeight: 700,
          marginTop: "4px",
          color: "var(--on-surface)",
          fontFamily: "var(--font-headline)",
        }}
      >
        {timeLeft}
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
