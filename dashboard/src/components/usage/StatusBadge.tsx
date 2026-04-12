export function StatusBadge({ status }: { status: string }) {
  const ok = status === "success" || status === "200";
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full ${
        ok
          ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
          : "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-green-500" : "bg-red-500"}`} />
      {status}
    </span>
  );
}
