import { useState, useEffect } from "react";

export function CountdownCard({
  target,
  sub,
  compact,
}: {
  target: string;
  sub?: string;
  compact?: boolean;
}) {
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

      if (diff <= 0) return "Reset now";

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
      if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
      if (minutes > 0) return `${minutes}m ${seconds}s`;
      return `${seconds}s`;
    };

    setTimeLeft(calculateTimeLeft());
    const timer = setInterval(() => setTimeLeft(calculateTimeLeft()), 1000);
    return () => clearInterval(timer);
  }, [target]);

  if (compact) {
    return (
      <span className="text-[12px] text-[var(--on-surface-variant)]">
        Resets in {timeLeft}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center overflow-hidden rounded-xl bg-card p-6 border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--on-surface-variant)] font-600">
        Resets In
      </p>
      <p className="mt-1 font-headline text-[28px] font-700 text-[var(--on-surface)]">
        {timeLeft}
      </p>
      {sub && <p className="mt-1 text-[11px] text-[var(--on-surface-variant)]">{sub}</p>}
    </div>
  );
}